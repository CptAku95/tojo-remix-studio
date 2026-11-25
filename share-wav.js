export async function shareWav(blob,name,report){
 if(!blob){report("Najpierw wygeneruj plik WAV.");return;}
 try{
  const file=new File([blob],name,{type:"audio/wav"});
  if(!navigator.share||(navigator.canShare&&!navigator.canShare({files:[file]}))){
   report("To Preview nie obsługuje udostępniania plików. Wynik nadal jest w pamięci. Spróbuj zwykłego pobierania.");return;
  }
  await navigator.share({files:[file]});
  report("Menu udostępniania zakończone. Sprawdź, czy plik jest w aplikacji Pliki.");
 }catch(e){
  report(e.name==="AbortError"?"Anulowano udostępnianie. Plik nadal jest w pamięci.":"Nie udało się udostępnić: "+(e.message||e.name)+". Wynik nadal jest w pamięci.");
 }
}