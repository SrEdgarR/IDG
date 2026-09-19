use idg_protocol::{MAX_FRAME, read_frame, write_frame};
use tokio::io::AsyncWriteExt;

#[tokio::test]
async fn fragmented_frame_and_clean_eof() {
    let (mut tx, mut rx) = tokio::io::duplex(8);
    let sender = tokio::spawn(async move {
        for byte in [3, 0, 0, 0, b'a', b'b', b'c'] {
            tx.write_all(&[byte]).await.unwrap();
        }
    });
    assert_eq!(read_frame(&mut rx).await.unwrap(), Some(b"abc".to_vec()));
    sender.await.unwrap();
    assert!(read_frame(&mut rx).await.unwrap().is_none());
}

#[tokio::test]
async fn oversized_zero_and_truncated_frames_are_rejected() {
    for bytes in [
        ((MAX_FRAME + 1) as u32).to_le_bytes().to_vec(),
        vec![0; 4],
        vec![1, 0],
        vec![2, 0, 0, 0, 1],
    ] {
        assert!(read_frame(&mut bytes.as_slice()).await.is_err());
    }
}

#[tokio::test]
async fn round_trip_and_outbound_limit() {
    let mut bytes = Vec::new();
    write_frame(&mut bytes, b"hello").await.unwrap();
    assert_eq!(
        read_frame(&mut bytes.as_slice()).await.unwrap().unwrap(),
        b"hello"
    );
    assert!(
        write_frame(&mut bytes, &vec![0; MAX_FRAME + 1])
            .await
            .is_err()
    );
}
