/** UTC calendar dates from retained completed interviews, not login activity. */
export function practiceCalendar(values:string[],now=new Date()){
  const days=[...new Set(values.filter(value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&value<=now.toISOString().slice(0,10)))].sort();
  const dayMs=86400000,toDay=(value:string)=>Math.floor(Date.parse(`${value}T00:00:00Z`)/dayMs);
  let longest=0,run=0,previous=-Infinity;
  for(const day of days){const n=toDay(day);run=n===previous+1?run+1:1;longest=Math.max(longest,run);previous=n;}
  const today=Math.floor(now.getTime()/dayMs),set=new Set(days.map(toDay));
  let cursor=set.has(today)?today:today-1,current=0;
  while(set.has(cursor)){current++;cursor--;}
  return {days,currentStreak:current,longestStreak:longest,timezone:"UTC"};
}
