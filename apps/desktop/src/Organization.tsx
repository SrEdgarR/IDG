import { useEffect, useState, useRef } from "react";
import { execute } from "./desktop";
import { Modal } from "./ui/Modal";
import type { DownloadQueue, OrganizationCommand, OrganizationState, DownloadSnapshot } from "../../../packages/shared-types/protocol";

export async function organize(operation:OrganizationCommand,id=crypto.randomUUID()) {
  const result=await execute({organization:{operation}},id);
  if(result.kind!=="organization")throw Error("No se confirmó la organización.");
  dispatchEvent(new Event("idg-organization-changed"));
  return result.state;
}
export function useOrganization(enabled=true) {
  const [state,setState]=useState<OrganizationState|null>(null),[error,setError]=useState("");
  useEffect(()=>{if(!enabled)return;let disposed=false,busy=false;
    const load=async()=>{if(busy||document.visibilityState==="hidden")return;busy=true;try{const r=await execute({organization:{operation:{action:"get"}}});if(!disposed&&r.kind==="organization"){setState(r.state);setError("");}}catch(e){if(!disposed)setError(String(e));}finally{busy=false;}};
    void load();const timer=setInterval(()=>void load(),2000);addEventListener("idg-organization-changed",load);
    return()=>{disposed=true;clearInterval(timer);removeEventListener("idg-organization-changed",load);};
  },[enabled]);
  return {state,error};
}
const blankQueue=():DownloadQueue=>({id:crypto.randomUUID(),name:"",running:false,concurrency:3,priority:"normal",schedule:null,on_finish:"none",power_armed:false});
/** Uses the existing gallery's modal, queue-item, form-grid and folded advanced structure. */
export function QueueEditor({onClose}:{onClose:()=>void}) {
  const {state,error}=useOrganization();const [draft,setDraft]=useState<DownloadQueue>(blankQueue);
  const [jobs,setJobs]=useState<DownloadSnapshot[]>([]),[failure,setFailure]=useState(""),[busy,setBusy]=useState(false),[moveTo,setMoveTo]=useState("main"),[remove,setRemove]=useState(false);
  const sending=useRef(false);
  const [scheduleError,setScheduleError]=useState("");
  const patch=(change:Partial<DownloadQueue>)=>setDraft({...draft,...change});
  async function loadJobs(){let offset:number|null=0;const all:DownloadSnapshot[]=[];while(offset!==null){const r=await execute({list_downloads:{offset}});if(r.kind!=="downloads")throw Error("Historial no disponible");all.push(...r.jobs);offset=r.next_offset;}setJobs(all);}
  useEffect(()=>{void loadJobs().catch(e=>setFailure(String(e)));},[]);
  async function act(operation:OrganizationCommand){if(sending.current)return false;sending.current=true;setBusy(true);setFailure("");try{const updated=await organize(operation);if(operation.action!=="move_jobs"&&operation.action!=="reorder")setDraft(current=>updated.queues.find(q=>q.id===current.id)??current);await loadJobs();return true;}catch(e){setFailure(String(e));return false;}finally{sending.current=false;setBusy(false);}}
  const queueJobs=jobs.filter(j=>j.queue_id===draft.id).sort((a,b)=>a.queue_order-b.queue_order||a.id.localeCompare(b.id));
  return <Modal title="Colas y programación" onClose={()=>{if(!busy)onClose();}}>
    {(error||failure||scheduleError)&&<p role="alert">{scheduleError||failure||error}</p>}
    <label className="field">Cola<select value={state?.queues.some(q=>q.id===draft.id)?draft.id:"new"} onChange={e=>{setRemove(false);setScheduleError("");setDraft(state?.queues.find(q=>q.id===e.target.value)??blankQueue());}}><option value="new">Nueva cola</option>{state?.queues.map(q=><option key={q.id} value={q.id}>{q.name} · {q.running?"En ejecución":"Detenida"}</option>)}</select></label>
    <label className="field">Nombre de la cola<input value={draft.name} maxLength={120} onChange={e=>patch({name:e.target.value})}/></label>
    <div className="form-grid"><label className="field">Simultáneas<input type="number" min={1} max={32} value={draft.concurrency} onChange={e=>patch({concurrency:Number(e.target.value)})}/></label><label className="field">Prioridad de cola<select value={draft.priority} onChange={e=>patch({priority:e.target.value as DownloadQueue["priority"]})}><option value="high">Alta</option><option value="normal">Normal</option><option value="low">Baja</option></select></label></div>
    <details><summary>Horario y opciones avanzadas</summary>
      <label className="field">Inicio único (fecha, hora y zona)<input placeholder="AAAA-MM-DDTHH:MM:SS+00:00" defaultValue={draft.schedule?new Date(draft.schedule.at*1000).toISOString():""} key={draft.id+String(draft.schedule?.at)} onBlur={e=>{const text=e.target.value.trim();setScheduleError("");if(!text){patch({schedule:null});return;}const time=Date.parse(text);if(!/(Z|[+-]\d\d:\d\d)$/.test(text)||!Number.isFinite(time)||time<0||time/1000>4294967295){setScheduleError("Indica una fecha ISO con zona explícita, por ejemplo +02:00 o Z (UTC).");return;}patch({schedule:{at:Math.floor(time/1000),state:"pending"},running:false});}}/></label>
      <p>La programación necesita el motor activo y Windows despierto. Se ejecuta una vez; recupera hasta 15 minutos de retraso y después vence sin iniciar.</p>
      {draft.schedule&&<p>Instante: {new Date(draft.schedule.at*1000).toLocaleString()} (hora del equipo). Estado: {{pending:"Pendiente",applied:"Aplicado",missed:"Vencido"}[draft.schedule.state]}.</p>}
      <label className="field">Al terminar<select value={draft.on_finish} onChange={e=>patch({on_finish:e.target.value as DownloadQueue["on_finish"]})}><option value="none">Ninguna</option><option value="shutdown">Apagar</option><option value="suspend">Suspender</option><option value="hibernate">Hibernar</option></select></label><p>Guardar no activa la energía. La activación siguiente es para una sola vez, tras completar y verificar todos los trabajos de IDG. Habrá 60 segundos para cancelar. Los errores, pausas y trabajos pendientes la bloquean.</p><button disabled={busy||draft.on_finish==="none"||!state?.queues.some(q=>q.id===draft.id)} onClick={()=>void act({action:"arm_power",id:draft.id,power:draft.on_finish})}>Confirmar y activar energía una vez</button><p>{state?.power_simulated?"Modo de prueba: no se enviarán acciones a Windows.":"Esta activación puede apagar, suspender o hibernar Windows."} {state?.queues.find(q=>q.id===draft.id)?.power_armed?"Activada para una vez.":"Sin activación pendiente."}</p>
    </details>
    <ol>{queueJobs.map((j,i)=><li className="queue-item" key={j.id}>{j.name} · {j.state}<button disabled={busy||i===0} aria-label={`Subir ${j.name}`} onClick={()=>{const ids=queueJobs.map(j=>j.id);[ids[i-1],ids[i]]=[ids[i],ids[i-1]];void act({action:"reorder",queue_id:draft.id,ids});}}>Subir</button><button disabled={busy||moveTo===draft.id} onClick={()=>void act({action:"move_jobs",ids:[j.id],queue_id:moveTo})}>Mover</button></li>)}</ol>
    <label className="field">Cola de destino<select value={moveTo} onChange={e=>setMoveTo(e.target.value)}>{state?.queues.map(q=><option key={q.id} value={q.id}>{q.name}</option>)}</select></label>
    <p>Detener impide nuevos inicios. Pausar activas es una acción distinta. Para mover u ordenar, pausa primero los trabajos activos.</p>
    {remove&&<div role="alert"><p>Eliminar esta cola reasigna todos sus trabajos a la cola de destino. No borra archivos ni cancela trabajos.</p><button disabled={busy||moveTo===draft.id} onClick={()=>void act({action:"delete_queue",id:draft.id,reassign_to:moveTo}).then(ok=>{if(ok){setRemove(false);setDraft(blankQueue());}})}>Confirmar reasignación y eliminar cola</button><button onClick={()=>setRemove(false)}>Conservar cola</button></div>}
    <footer className="dialog-actions"><button disabled={busy} onClick={onClose}>Cerrar</button><button disabled={busy||Boolean(scheduleError)||!draft.name.trim()} onClick={()=>void act({action:"save_queue",queue:draft})}>Guardar cola</button><button disabled={busy||!state?.queues.some(q=>q.id===draft.id)} onClick={()=>void act({action:"run_queue",id:draft.id,running:true})}>Iniciar cola</button><button disabled={busy} onClick={()=>void act({action:"run_queue",id:draft.id,running:false})}>Detener nuevos inicios</button><button disabled={busy} onClick={()=>void act({action:"pause_queue",id:draft.id})}>Pausar activas</button><button disabled={busy||draft.id==="main"} onClick={()=>setRemove(true)}>Eliminar cola</button></footer>
  </Modal>;
}

export function EnergyNotice(){const {state}=useOrganization();const [error,setError]=useState("");if(!state?.power_message)return null;return <aside role="status" className="connection-banner"><span>{state.power_simulated?"Simulación · ":""}{state.power_message}{state.power_remaining!==null?` en ${state.power_remaining} segundos`:""}</span>{state.power_remaining!==null&&<button onClick={()=>void organize({action:"cancel_power"}).catch(e=>setError(String(e)))}>Cancelar acción de energía</button>}{error&&<span role="alert">{error}</span>}</aside>;}
