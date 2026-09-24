//! Transfer engine and IPC session logic, independent of the desktop.
use idg_protocol::{Command, ErrorCode, Payload, Request, Response, Snapshot, VERSION};
pub mod clipboard;
pub mod download;
pub mod library;
pub mod organization;
pub mod power;
pub mod rules;

#[derive(Default)]
pub struct Session {
    greeted: bool,
}

impl Session {
    pub fn handle(&mut self, request: &Request, snapshot: Snapshot) -> Response {
        if request.version != VERSION {
            return Response::error(&request.id, ErrorCode::IncompatibleVersion);
        }
        if !self.greeted && request.command != Command::Handshake {
            return Response::error(&request.id, ErrorCode::HandshakeRequired);
        }
        let payload = match request.command {
            Command::Handshake => {
                self.greeted = true;
                Payload::Hello {
                    capabilities: vec![
                        Command::Handshake,
                        Command::Ping,
                        Command::GetSnapshot,
                        Command::Subscribe,
                        Command::Shutdown,
                    ],
                    snapshot,
                }
            }
            Command::Ping => Payload::Pong,
            Command::GetSnapshot => Payload::Snapshot { snapshot },
            Command::Subscribe => Payload::Subscribed { snapshot },
            Command::Shutdown => Payload::Stopping,
            _ => Payload::Error {
                code: ErrorCode::Unavailable,
            },
        };
        Response::new(&request.id, payload)
    }
}

impl Session {
    pub fn authorizes(&self, request: &Request) -> bool {
        self.greeted && request.version == VERSION
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn snapshot() -> Snapshot {
        Snapshot {
            native_hosts: 0,
            runtime_id: "fixture".into(),
            process_id: 42,
            sequence: 9,
            clients: 2,
            stopping: false,
        }
    }
    fn request(version: u32, command: Command) -> Request {
        Request {
            version,
            id: "test-1".into(),
            command,
        }
    }
    #[test]
    fn commands_require_compatible_handshake() {
        let mut session = Session::default();
        assert!(matches!(
            session
                .handle(&request(1, Command::Shutdown), snapshot())
                .payload,
            Payload::Error {
                code: ErrorCode::HandshakeRequired
            }
        ));
        assert!(matches!(
            session
                .handle(&request(2, Command::Handshake), snapshot())
                .payload,
            Payload::Error {
                code: ErrorCode::IncompatibleVersion
            }
        ));
        assert!(matches!(
            session
                .handle(&request(1, Command::Ping), snapshot())
                .payload,
            Payload::Error {
                code: ErrorCode::HandshakeRequired
            }
        ));
    }
    #[test]
    fn correlation_and_authoritative_snapshot_are_preserved() {
        let mut session = Session::default();
        session.handle(&request(1, Command::Handshake), snapshot());
        let response = session.handle(&request(1, Command::GetSnapshot), snapshot());
        assert_eq!(response.id, "test-1");
        assert!(
            matches!(response.payload, Payload::Snapshot { snapshot: s } if s.sequence == 9 && s.clients == 2)
        );
        assert!(matches!(
            session
                .handle(&request(1, Command::Ping), snapshot())
                .payload,
            Payload::Pong
        ));
    }
}
