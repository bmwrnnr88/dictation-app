// Dictation Spelling Game

// ---------- CONFIG ----------
const WORKER_TTS_URL = "https://broad-smoke-1c9d.brendanw.workers.dev";
const FIXED_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // change if you want a different voice
const FIXED_MODEL_ID = "eleven_turbo_v2_5";

// ---------- Utilities ----------
function normalizeForLenientCompare(s) {
  return s.replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/\s+/g,' ').trim().toLowerCase();
}

function normalizeStrict(s) {
  return s.replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/\s+/g,' ').trim();
}

function levenshtein(a,b){
  const m=a.length,n=b.length;
  const dp=Array.from({length:m+1},()=>new Array(n+1).fill(0));
  for(let i=0;i<=m;i++)dp[i][0]=i;
  for(let j=0;j<=n;j++)dp[0][j]=j;
  for(let i=1;i<=m;i++){
    for(let j=1;j<=n;j++){
      const cost=a[i-1]===b[j-1]?0:1;
      dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+cost);
    }
  }
  return dp[m][n];
}

function wordsOnly(s){
  return s.replace(/[“”]/g,'"').replace(/[‘’]/g,"'")
  .match(/[A-Za-z0-9]+(?:'[A-Za-z0-9]+)*/g)||[];
}

function wordDiff(correct,typed){
  const c=wordsOnly(correct);
  const t=wordsOnly(typed);
  const max=Math.max(c.length,t.length);
  const lines=[];
  for(let i=0;i<max;i++){
    const cw=c[i]??"";
    const tw=t[i]??"";
    if(!cw&&tw)lines.push(`+ extra: "${tw}"`);
    else if(cw&&!tw)lines.push(`- missing: "${cw}"`);
    else if(cw!==tw)lines.push(`! "${tw}" → "${cw}"`);
  }
  return lines;
}

function stripLeadingNumber(s){
  return s.replace(/^\s*(\d+[\)\.\:]\s+|\-\s+)/,"");
}

function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}

// ---------- DOM ----------
const sentencesInput=document.getElementById("sentencesInput");
const startSessionBtn=document.getElementById("startSessionBtn");
const setupPanel=document.getElementById("setupPanel");

const shuffleBtn=document.getElementById("shuffleBtn");
const retryMissesBtn=document.getElementById("retryMissesBtn");

const speakBtn=document.getElementById("speakBtn");
const repeatBtn=document.getElementById("repeatBtn");
const stopBtn=document.getElementById("stopBtn");

const autoSpeak=document.getElementById("autoSpeak");
const strictMode=document.getElementById("strictMode");

const studentInput=document.getElementById("studentInput");
const checkBtn=document.getElementById("checkBtn");
const nextBtn=document.getElementById("nextBtn");
const revealBtn=document.getElementById("revealBtn");

const roundNum=document.getElementById("roundNum");
const roundTotal=document.getElementById("roundTotal");
const correctCount=document.getElementById("correctCount");
const missCount=document.getElementById("missCount");

const feedback=document.getElementById("feedback");
const correctSentence=document.getElementById("correctSentence");
const maskedHint=document.getElementById("maskedHint");

// ---------- Game State ----------
let deck=[];
let misses=[];
let idx=0;
let correct=0;

let currentSentence="";
let lastSpoken="";

const audioCache=new Map();
let currentAudio=null;

// ---------- ElevenLabs TTS ----------
async function getElevenAudioUrl(text){

  if(audioCache.has(text))
    return audioCache.get(text);

  const resp=await fetch(WORKER_TTS_URL,{
    method:"POST",
    headers:{
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      text,
      voiceId:FIXED_VOICE_ID,
      modelId:FIXED_MODEL_ID
    })
  });

  if(!resp.ok){
    const msg=await resp.text().catch(()=> "");
    throw new Error(`TTS proxy error ${resp.status}: ${msg}`);
  }

  const blob=await resp.blob();
  const url=URL.createObjectURL(blob);

  audioCache.set(text,url);
  return url;
}

async function speak(text){

  if(currentAudio){
    currentAudio.pause();
    currentAudio.currentTime=0;
  }

  const url=await getElevenAudioUrl(text);
  currentAudio=new Audio(url);
  lastSpoken=text;
  await currentAudio.play();
}

function stopSpeaking(){
  if(currentAudio){
    currentAudio.pause();
    currentAudio.currentTime=0;
  }
}

// ---------- UI ----------
function setEnabled(enabled){
  shuffleBtn.disabled=!enabled;
  speakBtn.disabled=!enabled;
  repeatBtn.disabled=!enabled;
  stopBtn.disabled=!enabled;
  studentInput.disabled=!enabled;
  checkBtn.disabled=!enabled;
  nextBtn.disabled=!enabled;
  revealBtn.disabled=!enabled;
  retryMissesBtn.disabled=(misses.length===0);
}

function renderStatus(){
  roundNum.textContent=String(deck.length?idx+1:0);
  roundTotal.textContent=String(deck.length);
  correctCount.textContent=String(correct);
  missCount.textContent=String(misses.length);
}

function setRound(sentence){
  currentSentence=sentence;
  correctSentence.textContent=sentence;
  studentInput.value="";
  feedback.innerHTML="";
  maskedHint.textContent="";
  renderStatus();

  if(autoSpeak.checked) speak(sentence);

  studentInput.focus();
}

// ---------- Start ----------
function startSession(){

  const lines=sentencesInput.value
    .split("\n")
    .map(s=>stripLeadingNumber(s).trim())
    .filter(Boolean);

  if(lines.length===0){
    alert("Paste at least one sentence.");
    return;
  }

  deck=lines;
  misses=[];
  idx=0;
  correct=0;

  if(setupPanel) setupPanel.style.display="none";

  setEnabled(true);
  renderStatus();
  setRound(deck[idx]);
}

startSessionBtn.addEventListener("click",startSession);

// ---------- Buttons ----------
shuffleBtn.addEventListener("click",()=>{
  if(!deck.length) return;
  shuffle(deck);
  idx=0;
  setRound(deck[idx]);
});

retryMissesBtn.addEventListener("click",()=>{
  if(misses.length===0) return;
  deck=[...misses];
  misses=[];
  idx=0;
  correct=0;
  setRound(deck[idx]);
});

speakBtn.addEventListener("click",()=>{
  if(!currentSentence) return;
  speak(currentSentence);
});

repeatBtn.addEventListener("click",()=>{
  if(!lastSpoken) lastSpoken=currentSentence;
  if(!lastSpoken) return;
  speak(lastSpoken);
});

stopBtn.addEventListener("click",stopSpeaking);

revealBtn.addEventListener("click",()=>{
  correctSentence.textContent=currentSentence;
});

checkBtn.addEventListener("click",()=>{

  const typedRaw=studentInput.value;
  const correctRaw=currentSentence;

  const strict=strictMode.checked;
  const typed=strict?normalizeStrict(typedRaw):normalizeForLenientCompare(typedRaw);
  const corr=strict?normalizeStrict(correctRaw):normalizeForLenientCompare(correctRaw);

  const dist=levenshtein(corr,typed);
  const isExact=(corr===typed);

  if(isExact){
    correct+=1;
    feedback.innerHTML=`<span class="good">Correct</span>`;
    nextBtn.disabled=false;
  }else{
    if(!misses.includes(currentSentence))
      misses.push(currentSentence);

    const diffs=wordDiff(correctRaw,typedRaw);
    feedback.innerHTML=`<span class="bad">Not quite</span><div class="diff">${diffs.join("\n")}</div>`;
    nextBtn.disabled=false;
  }

  renderStatus();
});

nextBtn.addEventListener("click",()=>{

  idx+=1;

  if(idx>=deck.length){
    feedback.innerHTML=`<span class="good">Done</span>`;
    nextBtn.disabled=true;
    return;
  }

  nextBtn.disabled=true;
  setRound(deck[idx]);
});

studentInput.addEventListener("keydown",(e)=>{
  if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){
    e.preventDefault();
    checkBtn.click();
  }
});
