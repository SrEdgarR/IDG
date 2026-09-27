import { RuleResult } from "./Rules";
import type { RulePreview } from "../../../packages/shared-types/protocol";
import type { DesktopApi } from "./desktop";
import { DownloadFailure, execute } from "./desktop";
import { useOrganization } from "./Organization";
import { useState, useRef, useEffect } from "react";
import type {
  StartPolicy,
  ConflictPolicy,
  MediaMetadata,
  MediaOutput,
  MediaPlan,
} from "../../../packages/shared-types/protocol";
import { Modal, Pending } from "./ui/Modal";
import { validateDraft } from "./model";

function describeMediaMetadata(media: MediaMetadata): string {
  const details = [
    media.frame_rate_milli ? `${(media.frame_rate_milli / 1000).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} FPS` : null,
    media.video_codec,
    media.audio_codec,
    media.video_tracks ? `${media.video_tracks} pista(s) de video` : null,
    media.audio_tracks ? `${media.audio_tracks} pista(s) de audio` : null,
  ].filter((value): value is string => value !== null);
  return details.length ? details.join(" · ") : "Desconocidos; no se deducen";
}

function manifestUrl(url: string): boolean {
  try {
    return /\.(m3u8|mpd)$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function mediaExtension(output: MediaOutput): string {
  return ({
    mp4: "mp4",
    matroska: "mkv",
    audio_original: "mka",
    mp3: "mp3",
    aac: "aac",
    flac: "flac",
  } as const)[output];
}

function audioOnly(output: MediaOutput): boolean {
  return ["audio_original", "mp3", "aac", "flac"].includes(output);
}
export function NewDownloadDialog({
  onClose,
  backend,
  initialUrl = "",
  initialName = "",
  captureId,
  media,
  onAccepted,
}: {
  onClose: () => void;
  backend?: DesktopApi;
  initialUrl?: string;
  initialName?: string;
  captureId?: string;
  media?: MediaMetadata;
  onAccepted?: () => void;
}) {
  const [directory, setDirectory] = useState("");
  const { state: organization } = useOrganization(Boolean(backend));
  const [queueId, setQueueId] = useState("main");
  const [applyRules, setApplyRules] = useState(true),
    [ruleOverrides, setRuleOverrides] = useState<string[]>([]),
    [rulePreview, setRulePreview] = useState<RulePreview | null>(null);
  const override = (key: string) => {
    setRuleOverrides((old) => (old.includes(key) ? old : [...old, key]));
    setRulePreview(null);
  };
  const directoryEdited = useRef(false);
  const [category, setCategory] = useState(media?.kind === "video" ? "Videos" : "Otros");
  const [conflict, setConflict] = useState<ConflictPolicy>("reject");
  const [conflictOpen, setConflictOpen] = useState(false);
  const [recoverable, setRecoverable] = useState<string | null>(null);
  const [pendingStart, setPendingStart] = useState<StartPolicy>("now");
  useEffect(() => {
    if (backend)
      void backend
        .preferences()
        .then((p) => {
          if (!directoryEdited.current) setDirectory(p.directory);
          setFfmpegConfigured(Boolean(p.media_ffmpeg_path));
        })
        .catch(() => {});
  }, [backend]);
  const [replaySafe, setReplaySafe] = useState(false);
  const [requests, setRequests] = useState("automatic");
  const [limit, setLimit] = useState("");
  const [priority, setPriority] = useState<"normal" | "high" | "low">("normal");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const [mediaPlan, setMediaPlan] = useState<MediaPlan | null>(null);
  const [mediaVariant, setMediaVariant] = useState<number | null>(null);
  const [mediaAudio, setMediaAudio] = useState<number | null>(null);
  const [mediaOutput, setMediaOutput] = useState<MediaOutput>("mp4");
  const [analyzingMedia, setAnalyzingMedia] = useState(false);
  const [ffmpegConfigured, setFfmpegConfigured] = useState(false);
  const sending = useRef(false);
  const requestId = useRef(crypto.randomUUID());
  async function submit(
    start: StartPolicy = "now",
    policy: ConflictPolicy = conflict,
  ) {
    if (!backend || sending.current) return;
    setChecked(true);
    setFailure("");
    if (Object.keys(validateDraft(name, url)).length || !directory) {
      setFailure("Revisa URL, nombre y carpeta.");
      return;
    }
    const isManifest =
      media?.manifest_kind === "hls" ||
      media?.manifest_kind === "dash" ||
      manifestUrl(url);
    if (isManifest && !mediaPlan) {
      setFailure("Analiza el manifiesto antes de crear el trabajo multimedia.");
      return;
    }
    if (mediaPlan && mediaVariant === null && mediaAudio === null) {
      setFailure("Selecciona una variante o una pista de audio disponible.");
      return;
    }
    const selectedVariant = mediaPlan?.variants.find((variant) => variant.index === mediaVariant);
    if (mediaPlan && !audioOnly(mediaOutput) && mediaVariant === null) {
      setFailure("Selecciona una variante de video disponible.");
      return;
    }
    if (mediaPlan && !ffmpegConfigured) {
      setFailure("Configura FFmpeg y ffprobe en Ajustes → Video y audio antes de crear el trabajo.");
      return;
    }
    if (mediaPlan?.kind === "hls" && !audioOnly(mediaOutput) && selectedVariant?.audio_group && mediaAudio === null) {
      setFailure("Selecciona la pista de audio vinculada a esta variante.");
      return;
    }
    const selectedAudio = mediaPlan?.audio_tracks.find(
      (track) => track.index === mediaAudio,
    );
    if (mediaPlan && audioOnly(mediaOutput) && !selectedAudio?.external) {
      setFailure("La conversión de audio requiere una pista separada y seleccionable.");
      return;
    }
    if (captureId && !replaySafe) {
      setFailure("Para transferir desde Chromium, confirma que este GET público puede repetirse sin una sesión ni un token de un solo uso. Si tienes dudas, cancela y deja la descarga en el navegador.");
      return;
    }
    sending.current = true;
    setBusy(true);
    setRecoverable(null);
    try {
      if (policy === "reject" && !captureId) {
        const match = await backend.recoverable({
          url,
          directory,
          name,
          expected_sha256: null,
          conflict: policy,
        });
        if (match) {
          setRecoverable(match);
          setPendingStart(start);
          setConflictOpen(true);
          return;
        }
      }
      const id = captureId ?? requestId.current;
      const newInput = { url, directory, name, expected_sha256: null, conflict: policy };
      const transferOptions = {
          mode:
            requests === "automatic"
              ? "automatic"
              : { manual: { requests: Number(requests) } },
          replay_safe: replaySafe,
          bytes_per_second: limit ? Number(limit) * 1024 : null,
          priority,
        } as const;
      const draft = {
        input: newInput,
        options: transferOptions,
        category,
        start: captureId ? "later" as const : start,
        queue_id: queueId,
        apply_rules: applyRules,
        rule_overrides: ruleOverrides,
        context: captureId ? `extension:${captureId}` : "",
        private: false,
      };
      const result = mediaPlan
        ? await backend.addMedia(id, draft, mediaPlan.fingerprint, {
            variant_index:
              mediaPlan.kind === "dash" && audioOnly(mediaOutput)
                ? null
                : mediaVariant,
            audio_track_index: mediaAudio,
            output: mediaOutput,
          })
        : await backend.add(
            id,
            newInput,
            transferOptions,
            category,
            captureId ? "later" : start,
            queueId,
            applyRules,
            ruleOverrides,
            captureId ? `extension:${captureId}` : "",
          );
      if (result.kind !== "download")
        throw new Error("El motor no confirmó el trabajo.");
      if (captureId) onAccepted?.();
      else onClose();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
      if (e instanceof DownloadFailure && e.code === "conflict") {
        setPendingStart(start);
        setConflictOpen(true);
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  const [name, setName] = useState(initialName);
  const [url, setUrl] = useState(initialUrl);
  const isManifest =
    media?.manifest_kind === "hls" ||
    media?.manifest_kind === "dash" ||
    manifestUrl(url);
  async function analyzeMedia() {
    if (!backend || !url || analyzingMedia) return;
    setAnalyzingMedia(true);
    setFailure("");
    try {
      const plan = await backend.inspectMedia(url);
      setMediaPlan(plan);
      setMediaVariant(plan.variants[0]?.index ?? null);
      setMediaAudio(
        plan.audio_tracks.find((track) => track.is_default)?.index ??
          plan.audio_tracks[0]?.index ??
          null,
      );
      chooseOutput(plan.variants.length ? "mp4" : "audio_original");
      setCategory(plan.variants.length ? "Videos" : "Música");
    } catch (e) {
      setMediaPlan(null);
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzingMedia(false);
    }
  }
  const compatibleAudio = mediaPlan?.audio_tracks.filter(
    (track) =>
      !track.group ||
      !mediaPlan.variants.find((variant) => variant.index === mediaVariant)
        ?.audio_group ||
      track.group ===
        mediaPlan.variants.find((variant) => variant.index === mediaVariant)
          ?.audio_group,
  ) ?? [];
  const chosenAudio = compatibleAudio.find((track) => track.index === mediaAudio);
  const canConvertAudio = Boolean(chosenAudio?.external);
  function chooseOutput(output: MediaOutput) {
    setMediaOutput(output);
    const extension = mediaExtension(output);
    setName((current) => {
      const dot = current.lastIndexOf(".");
      const stem = dot > 0 ? current.slice(0, dot) : current;
      return `${stem}.${extension}`;
    });
  }
  const [reveal, setReveal] = useState(false);
  const [checked, setChecked] = useState(false);
  const errors = checked ? validateDraft(name, url) : {};
  return (
    <Modal
      title="Nueva descarga"
      onClose={() => {
        if (!sending.current) onClose();
      }}
    >
      <p className="muted">
        {captureId
          ? "El navegador conserva la descarga original hasta que IDG confirme un trabajo persistido y reciba datos. Si cancelas, continúa en el navegador."
          : backend
          ? "Revisa el destino. No se consulta el enlace hasta aceptar la descarga."
          : "Prepara los datos del archivo. Todavía no se enviarán al motor."}
      </p>
      {media && !isManifest && (
        <section className="media-capture-summary" aria-label="Medio seleccionado">
          <h3>{media.title || (media.kind === "video" ? "Video seleccionado" : "Audio seleccionado")}</h3>
          <dl>
            <div><dt>Tipo</dt><dd>{media.kind === "video" ? "Video" : "Audio"}</dd></div>
            <div><dt>MIME</dt><dd>{media.mime_type ?? "Desconocido"}</dd></div>
            {media.width && media.height && <div><dt>Resolución</dt><dd>{media.width} × {media.height}</dd></div>}
            <div><dt>FPS / códec / pistas</dt><dd>{describeMediaMetadata(media)}</dd></div>
            <div><dt>Duración</dt><dd>{media.duration_ms ? `${Math.floor(Number(media.duration_ms) / 60000)}:${String(Math.floor(Number(media.duration_ms) / 1000) % 60).padStart(2, "0")}` : "Desconocida"}</dd></div>
            <div><dt>Tamaño</dt><dd>{media.size_bytes ? `${media.size_bytes} bytes · ${media.size_kind === "exact" ? "respuesta HTTP" : "estimado"}` : "Desconocido"}</dd></div>
          </dl>
          <p className="muted">El archivo directo conserva su contenido original. Las pistas y conversiones se ofrecen solo al analizar un manifiesto HLS o DASH compatible.</p>
        </section>
      )}
      {isManifest && (
        <section className="media-capture-summary" aria-label="Procesamiento HLS y DASH">
          <h3>{mediaPlan ? `Manifiesto ${mediaPlan.kind.toUpperCase()}` : "Procesar manifiesto multimedia"}</h3>
          <p className="muted">IDG analiza manifiestos públicos HLS VOD sin cifrar y DASH estáticos sin DRM. No transfiere cookies o sesiones, no procesa emisiones en directo y rechaza estructuras o referencias que no admite.</p>
          {!mediaPlan ? (
            <button type="button" disabled={!backend || analyzingMedia || busy} onClick={() => void analyzeMedia()}>
              {analyzingMedia ? "Analizando manifiesto…" : "Analizar HLS/DASH"}
            </button>
          ) : (
            <>
              <p>{mediaPlan.variants.length} variante(s) de video · {mediaPlan.audio_tracks.length} pista(s) de audio · duración {mediaPlan.duration_ms ? `${Math.floor(Number(mediaPlan.duration_ms) / 60000)}:${String(Math.floor(Number(mediaPlan.duration_ms) / 1000) % 60).padStart(2, "0")}` : "desconocida"}</p>
              {mediaPlan.variants.length > 0 && (
                <label className="field">
                  Variante de video
                  <select aria-label="Variante de video" value={mediaVariant ?? ""} onChange={(event) => setMediaVariant(event.target.value === "" ? null : Number(event.target.value))}>
                    <option value="">Selecciona una variante</option>
                    {mediaPlan.variants.map((variant) => (
                      <option key={variant.index} value={variant.index}>
                        {variant.label}{variant.bandwidth_bps ? ` · ${Math.round(Number(variant.bandwidth_bps) / 1000)} kb/s` : ""}{variant.codecs.length ? ` · ${variant.codecs.join(", ")}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {compatibleAudio.length > 0 && (
                <label className="field">
                  Pista de audio
                  <select aria-label="Pista de audio" value={mediaAudio ?? ""} onChange={(event) => setMediaAudio(event.target.value === "" ? null : Number(event.target.value))}>
                    <option value="">Sin seleccionar una pista externa (puede conservar audio integrado)</option>
                    {compatibleAudio.map((track) => (
                      <option key={track.index} value={track.index}>
                        {track.label}{track.language ? ` · ${track.language}` : ""}{track.channels ? ` · ${track.channels}` : ""}{track.is_default ? " · predeterminada" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="field">
                Salida
                <select aria-label="Salida multimedia" value={mediaOutput} onChange={(event) => chooseOutput(event.target.value as MediaOutput)}>
                  <option value="mp4" disabled={mediaPlan.variants.length === 0}>MP4 · conservar codecs compatibles</option>
                  <option value="matroska" disabled={mediaPlan.variants.length === 0}>Matroska · conservar codecs</option>
                  <option value="audio_original" disabled={!canConvertAudio}>Solo audio original · Matroska</option>
                  <option value="mp3" disabled={!canConvertAudio}>Convertir audio a MP3</option>
                  <option value="aac" disabled={!canConvertAudio}>Convertir audio a AAC</option>
                  <option value="flac" disabled={!canConvertAudio}>Convertir audio a FLAC</option>
                </select>
              </label>
              <p className="muted">La copia/remultiplexado no recodifica video. MP3, AAC y FLAC recodifican audio y pueden cambiar calidad; FLAC no recupera calidad perdida. La salida y codecs se verifican antes de publicar el archivo.</p>
              {!ffmpegConfigured && <p className="error-text">Configura FFmpeg y ffprobe en Ajustes → Video y audio para procesar este manifiesto.</p>}
            </>
          )}
        </section>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setChecked(true);
        }}
        noValidate
      >
        <label className="field">
          URL del archivo
          <input
            type={reveal ? "text" : "password"}
            value={url}
            readOnly={!!captureId}
            autoComplete="off"
            spellCheck={false}
            required
            aria-invalid={!!errors.url}
            aria-describedby="url-help url-error"
            onChange={(e) => { setUrl(e.target.value); setMediaPlan(null); }}
          />
        </label>
        <small id="url-help" className="muted">
          Se oculta para proteger enlaces privados. Al analizar HLS/DASH se consulta solo el manifiesto y las referencias seleccionadas.
        </small>
        <label className="check-field">
          <input
            type="checkbox"
            checked={reveal}
            onChange={(e) => setReveal(e.target.checked)}
          />
          Mostrar URL
        </label>
        <p id="url-error" className="error-text">
          {errors.url}
        </p>
        <label className="field">
          Nombre del archivo
          <input
            value={name}
            readOnly={!!captureId}
            required
            aria-invalid={!!errors.name}
            aria-describedby="name-error"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <p id="name-error" className="error-text">
          {errors.name}
        </p>
        <div className="form-grid">
          <label className="field">
            Carpeta
            <input
              disabled={!backend || busy}
              value={directory}
              onFocus={() => {
                directoryEdited.current = true;
              }}
              onChange={(e) => {
                directoryEdited.current = true;
                setDirectory(e.target.value);
                override("directory");
              }}
              placeholder="Elige una carpeta"
            />
          </label>
          <label className="field">
            Categoría
            <select
              aria-label="Categoría"
              value={backend ? category : undefined}
              defaultValue={backend ? undefined : "Automática"}
              onChange={(e) => {
                setCategory(e.target.value);
                override("category");
              }}
            >
              {!backend && <option>Automática</option>}
              {(
                organization?.categories ?? [
                  "Videos",
                  "Documentos",
                  "Programas",
                  "Comprimidos",
                  "Otros",
                ]
              ).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          disabled={!backend || busy}
          onClick={() =>
            void backend
              ?.chooseFolder()
              .then((folder) => {
                if (folder) {
                  directoryEdited.current = true;
                  setDirectory(folder);
                  override("directory");
                }
              })
              .catch(() => setFailure("No se pudo elegir la carpeta."))
          }
        >
          Elegir carpeta…
        </button>
        <dl className="metadata">
          <div>
            <dt>Tamaño / tipo</dt>
            <dd>Desconocidos</dd>
          </div>
          <div>
            <dt>Sitio de origen</dt>
            <dd>No comprobado</dd>
          </div>
          <div>
            <dt>Reanudabilidad</dt>
            <dd>Desconocida</dd>
          </div>
        </dl>
        {backend && (
          <label className="field">
            Si existe el destino
            <select
              value={conflict}
              onChange={(e) => setConflict(e.target.value as ConflictPolicy)}
            >
              <option value="reject">Preguntar (conservar el archivo)</option>
              <option value="rename">Renombrar automáticamente</option>
              <option value="replace">
                Reemplazar explícitamente al completar
              </option>
            </select>
            <small>
              Reemplazar solo publica tras verificar. Reanudar requiere el
              trabajo original y su checkpoint; no basta el nombre.
            </small>
          </label>
        )}
        <details>
          <summary>Avanzado</summary>
          {backend && (
            <section>
              <label>
                <input
                  type="checkbox"
                  checked={applyRules}
                  onChange={(e) => {
                    setApplyRules(e.target.checked);
                    setRulePreview(null);
                  }}
                />{" "}
                Aplicar reglas guardadas a esta descarga
              </label>
              <p>
                Los campos que cambies explícitamente prevalecen. No se consulta
                la URL para obtener tamaño o tipo.
              </p>
              <button
                type="button"
                disabled={busy || !applyRules}
                onClick={() =>
                  void execute({
                    organization: {
                      operation: {
                        action: "preview_rules",
                        input: {
                          url,
                          directory,
                          name,
                          expected_sha256: null,
                          conflict,
                        },
                        overrides: ruleOverrides,
                      },
                    },
                  })
                    .then((r) => {
                      if (r.kind === "rule_preview") setRulePreview(r.preview);
                    })
                    .catch((e) => setFailure(String(e)))
                }
              >
                Previsualizar reglas
              </button>
              {rulePreview && <RuleResult preview={rulePreview} />}
            </section>
          )}
          {backend && (
            <label className="field">
              Cola de descarga
              <select
                value={queueId}
                onChange={(e) => {
                  setQueueId(e.target.value);
                  override("queue_id");
                }}
              >
                {organization?.queues.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="form-grid">
            <label className="field">
              Conexiones
              <select
                disabled={!backend || busy}
                value={requests}
                onChange={(e) => setRequests(e.target.value)}
              >
                <option value="automatic">Automáticas</option>
                {[1, 2, 4, 8, 16, 32].map((n) => (
                  <option key={n} value={n}>
                    {n} solicitudes como máximo
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Límite
              <input
                type="number"
                min="1"
                max="4194303"
                disabled={!backend || busy}
                value={limit}
                onChange={(e) => {
                  setLimit(e.target.value);
                  override("bytes_per_second");
                }}
                placeholder="Sin límite (KiB/s)"
              />
            </label>
            <label className="field">
              Prioridad
              <select
                value={priority}
                onChange={(e) => {
                  setPriority(e.target.value as typeof priority);
                  override("priority");
                }}
              >
                <option value="normal">Normal</option>
                <option value="high">Alta</option>
                <option value="low">Baja</option>
              </select>
            </label>
          </div>
          <p className="muted">
            Proxy y datos de solicitud protegidos: fases 11–12.
          </p>
          <label className="field">
            Proxy
            <select disabled aria-describedby="backend-pending">
              <option>Configuración heredada · pendiente</option>
            </select>
          </label>
          <label className="field">
            Datos de solicitud permitidos
            <input
              type="password"
              disabled
              placeholder="Importación segura pendiente · sin datos privados"
              aria-describedby="backend-pending"
            />
          </label>
        </details>
        {backend ? (
          <>
            <label className="check-field">
              <input
                type="checkbox"
                disabled={busy}
                checked={replaySafe}
                onChange={(e) => setReplaySafe(e.target.checked)}
              />
              El enlace permite solicitudes repetidas
            </label>
            <p className="muted">
              {captureId ? "Obligatorio para transferir desde el navegador: confirma que es un GET público, repetible y sin sesión. Si no estás seguro, cancela y usa el navegador." : "Actívalo solo para un enlace reutilizable. Ante dudas o enlaces de un solo uso se usa una solicitud secuencial; Automático no anula esta protección."}
            </p>
          </>
        ) : (
          <Pending />
        )}
        {failure && (
          <p role="alert" className="error-text">
            {failure}
          </p>
        )}
        <button type="submit">Validar datos</button>
        {checked && (
          <p role="status">
            {Object.keys(errors).length
              ? "Revisa los campos indicados."
              : "Formato válido. No se ha creado ni iniciado ninguna descarga."}
          </p>
        )}
        <footer className="dialog-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          {!captureId && <button
            type="button"
            disabled={!backend || busy}
            onClick={() => void submit("later")}
          >
            Descargar después
          </button>}
          {!captureId && <button
            type="button"
            disabled={!backend || busy}
            onClick={() => void submit("queue")}
          >
            Añadir a cola
          </button>}
          <button
            type="button"
            className="primary"
            disabled={!backend || busy}
            onClick={() => void submit()}
          >
            {captureId ? "Aceptar en IDG" : "Descargar ahora"}
          </button>
        </footer>
      </form>
      {conflictOpen && (
        <ExistingFileDialog
          name={name}
          onResume={
            recoverable
              ? () => {
                  void backend
                    ?.action(recoverable, "resume")
                    .then(() => onClose())
                    .catch((e) => {
                      setFailure(String(e));
                      setConflictOpen(false);
                    });
                }
              : undefined
          }
          onResolve={(choice) => {
            setConflict(choice);
            setConflictOpen(false);
            void submit(pendingStart, choice);
          }}
          onClose={() => setConflictOpen(false)}
        />
      )}
    </Modal>
  );
}
export function ExistingFileDialog({
  onClose,
  name,
  onResolve,
  onResume,
}: {
  onClose: () => void;
  name?: string;
  onResolve?: (choice: ConflictPolicy) => void;
  onResume?: () => void;
}) {
  const [choice, setChoice] = useState("rename");
  return (
    <Modal title="Ya existe un archivo con este nombre" onClose={onClose}>
      <p className="sample-note">
        {onResolve
          ? "El runtime rechazó el destino. El archivo existente se conserva hasta una publicación autorizada y verificada."
          : "Muestra de galería. No se consulta ni modifica el disco."}
      </p>
      <div className="file-conflict">
        <strong>{name ?? "Manual de ejemplo.pdf"}</strong>
        {!onResolve && (
          <>
            <p className="muted">Descargas / Manual de ejemplo.pdf</p>
            <small>2,4 MiB · 19 septiembre 2026 · datos de ejemplo</small>
          </>
        )}
      </div>
      <label className="check-field">
        <input
          type="radio"
          name="conflict"
          checked={choice === "rename"}
          onChange={() => setChoice("rename")}
        />
        Renombrar automáticamente
      </label>
      <p className="muted">
        {onResolve
          ? "El motor elegirá un nombre disponible al publicar."
          : "Vista previa: Manual de ejemplo (1).pdf. El motor deberá reservar el nombre."}
      </p>
      <label className="check-field">
        <input
          type="radio"
          name="conflict"
          checked={choice === "replace"}
          onChange={() => setChoice("replace")}
        />
        Sobrescribir
      </label>
      {choice === "replace" && (
        <p role="alert" className="error-text">
          Se requiere confirmar el reemplazo del archivo indicado. No se borrará
          nada{" "}
          {onResolve
            ? "antes de completar y verificar la descarga nueva"
            : "en esta galería"}
          .
        </p>
      )}
      <label className="check-field">
        <input
          type="radio"
          disabled={!onResume}
          checked={choice === "resume"}
          onChange={() => setChoice("resume")}
          name="conflict"
        />
        Reanudar
      </label>
      <p className="muted">
        {onResume
          ? "Parcial identificado por URL, destino, validador y hashes durables. La respuesta HTTP debe validar la misma representación antes de continuar."
          : "No disponible: la identidad del parcial no ha sido verificada."}
      </p>
      {!onResolve && <Pending />}
      <footer className="dialog-actions">
        <button onClick={onClose}>Cancelar</button>
        <button
          disabled={!onResolve}
          onClick={() =>
            choice === "resume"
              ? onResume?.()
              : onResolve?.(choice as ConflictPolicy)
          }
          aria-describedby={onResolve ? undefined : "backend-pending"}
        >
          {choice === "resume"
            ? "Reanudar parcial validado"
            : choice === "replace"
              ? "Confirmar sobrescritura"
              : "Usar nombre propuesto"}
        </button>
      </footer>
    </Modal>
  );
}
export function ConfirmDialog({
  name,
  onClose,
}: {
  name: string;
  onClose: () => void;
}) {
  return (
    <Modal title="Eliminar del disco" onClose={onClose}>
      <p>Archivo seleccionado:</p>
      <ul>
        <li>{name}</li>
      </ul>
      <p className="error-text">
        Eliminar del disco es distinto de quitar del historial.
      </p>
      <Pending>
        No se eliminará ningún archivo. Validación de propiedad y Papelera
        pendientes de fase 12.
      </Pending>
      <footer className="dialog-actions">
        <button onClick={onClose}>Cancelar</button>
        <button className="danger" disabled aria-describedby="backend-pending">
          Eliminar archivo
        </button>
      </footer>
    </Modal>
  );
}
