import {useEffect,useState} from 'react';
export type Theme='system'|'light'|'dark';
export function useAppearance(){
 const [theme,setTheme]=useState<Theme>(()=>{try{const t=localStorage.getItem('idg.ui.theme');return t==='light'||t==='dark'?t:'system';}catch{return 'system';}});
 useEffect(()=>{document.documentElement.dataset.theme=theme;try{localStorage.setItem('idg.ui.theme',theme);}catch{/* UI remains usable without storage. */}},[theme]);
 return {theme,setTheme};
}
