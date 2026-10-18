import {useEffect} from 'react';
const locks=new Set<symbol>();
let original='';
/** Overlapping navigation/dialog owners release only their own scroll lock. */
export function useScrollLock(active:boolean){
 useEffect(()=>{if(!active)return;const token=Symbol();if(!locks.size)original=document.body.style.overflow;locks.add(token);document.body.style.overflow='hidden';return()=>{locks.delete(token);if(!locks.size)document.body.style.overflow=original;};},[active]);
}
