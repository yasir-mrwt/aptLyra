import {useId} from 'react';
import type {CustomSelectProps} from '../types/components';
export default function CustomSelect({options,value,onChange,name,label,placeholder}:CustomSelectProps){
 const id=useId();
 const normalized=options.map(opt=>typeof opt==='object'?opt:{label:String(opt),value:opt});
 return <div>{label&&<label htmlFor={id} className="block mb-3 text-sm text-surface-300">{label}</label>}<select id={id} name={name} aria-label={label||name} value={value} onChange={event=>{const selected=normalized.find(opt=>String(opt.value)===event.target.value);if(selected)onChange(name,selected.value);}} className="w-full rounded-xl border border-white/10 bg-surface-900 p-3 text-white">{(placeholder||!normalized.some(opt=>opt.value===value))&&<option value="" disabled>{placeholder||`Choose ${label.toLowerCase()}`}</option>}{normalized.map(opt=><option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></div>;
}
