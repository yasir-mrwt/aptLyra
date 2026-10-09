import { useId } from "react";

type AptlyraMarkProps={className?:string;decorative?:boolean};

export default function AptlyraMark({className="h-9 w-9",decorative=false}:AptlyraMarkProps){
  const gradientId=`aptlyra-mark-${useId().replaceAll(":","")}`;
  return <svg className={className} viewBox="0 0 48 48" fill="none" role={decorative?undefined:"img"} aria-label={decorative?undefined:"Aptlyra"} aria-hidden={decorative||undefined}>
    <defs><linearGradient id={gradientId} x1="6" y1="5" x2="43" y2="44" gradientUnits="userSpaceOnUse"><stop stopColor="#A5F3FC"/><stop offset=".52" stopColor="#67E8F9"/><stop offset="1" stopColor="#818CF8"/></linearGradient></defs>
    <path d="M24 3.8 44.2 39H3.8L24 3.8Z" stroke={`url(#${gradientId})`} strokeWidth="2.8" strokeLinejoin="round"/>
    <path d="m15.4 31.6 8.6-15 8.6 15M19.1 25.5h9.8" stroke={`url(#${gradientId})`} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="24" cy="39" r="2.1" fill="#A5F3FC"/>
  </svg>;
}
