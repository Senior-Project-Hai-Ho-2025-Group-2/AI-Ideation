/* ====================  main.js  ==================== */

/* -----------  Global helpers & constants  ----------- */
const LOG_LEVELS = { INFO: 'INFO', DEBUG: 'DEBUG', ERROR: 'ERROR', WARN: 'WARN' };
const LOG_VERBOSE = () => window.LOG_VERBOSE ?? false;
const now = () => new Date().toISOString();

/* ---------------  Logging helper  ------------------- */
function log(msg, level = LOG_LEVELS.INFO, raw = null){
  const line = `${now()} [${level}] ${msg}\n`;
  console.log(level === LOG_LEVELS.ERROR ? msg : line.trim());
  const logEl = document.getElementById('log');
  logEl.textContent += raw ? `${line}${raw}\n` : line;
  logEl.scrollTop = logEl.scrollHeight;
}

/* --------------  Spinner helper  ------------------- */
function showSpinner(show){
  document.getElementById('spinner').style.display = show ? 'block' : 'none';
  log(`Spinner ${show ? 'SHOW' : 'HIDE'}`, LOG_LEVELS.INFO);
}

/* --------------  UI helpers  -------------------- */
function handleModelType(){
  const type = document.getElementById('modelType').value;
  document.getElementById('apiKeyField').classList.toggle('hidden', type !== 'openai');
  document.getElementById('urlField').classList.toggle('hidden', type !== 'selfhosted');
  if(type === 'openai'){
    document.getElementById('modelSelect').innerHTML =
      '<option value="gpt-3.5-turbo">gpt‑3.5‑turbo</option>';
    document.getElementById('modelSelectField').classList.remove('hidden');
  }
}

/* ----------  Fetch self‑hosted model tags  --------- */
async function fetchModels(){
  const url = document.getElementById('modelUrl').value.trim();
  if(!url) return;
  const urlPattern = /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/;
  if(!urlPattern.test(url)){ alert('Enter a valid URL'); return; }

  log(`Fetching models from ${url}/api/tags`, LOG_LEVELS.INFO);
  showSpinner(true);
  try{
    const resp = await fetch(`${url}/api/tags`);
    if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const select = document.getElementById('modelSelect');
    select.innerHTML = '';
    data.models.forEach(m=>{
      const opt = document.createElement('option');
      opt.value = m.name; opt.textContent = m.name; select.appendChild(opt);
    });
    document.getElementById('modelSelectField').classList.remove('hidden');
    log(`Fetched ${data.models.length} models`, LOG_LEVELS.INFO);
  }catch(err){
    console.error(err); log(`Error fetching models: ${err.message}`, LOG_LEVELS.ERROR);
    alert('Could not fetch models');
  }finally{ showSpinner(false); }
}

/* ------------  Prompt builder  ------------------- */
function buildPrompt(params){
  let prompt = `Generate 3 innovative senior design project ideas for computer engineering students with these specifications:
Team: 4 students, 2 semesters (8‑9 months)
Budget: $${params.budget}
Complexity: ${params.complexity}
Innovation Level: ${params.innovation}/10 (1=safe/proven, 10=cutting‑edge/risky)`;

  if (params.problemStatement){
    prompt += `\nProblem to Solve: ${params.problemStatement}`;
  }
  if (params.technologies.length > 0){
    prompt += `\nPreferred Technologies: ${params.technologies.join(', ')}`;
  }

  prompt += `\n\nFor each project, provide:
1. **Project Title**: Clear, descriptive name
2. **Description**: 2‑3 sentences explaining the concept and target problem
3. **Key Components**: List of required hardware/software components
4. **Technologies**: Specific technologies used
5. **Estimated Cost**: Breakdown of major components
6. **Timeline**: 8‑month milestone timeline
7. **Market Appeal**: Target audience and value proposition
8. **Challenges**: Main technical and implementation challenges
9. **Unique Value**: What makes this project special/different
Format each project clearly with headers and bullet points.`;

  return prompt;
}

/* ----------  Show/Hide the thinking card  ---------- */
function showThinkingCard(show){
  const card = document.getElementById('thinkingContainer');
  card.classList.toggle('hidden', !show);
}

/* ----------  NDJSON streaming helper  ---------- */
async function streamNDJSON(resp, onContent, onThinking, onDone){
  const decoder = new TextDecoder();
  let leftover = '';
  const reader = resp.body.getReader();

  try{
    log('--- Stream NDJSON: START ---', LOG_LEVELS.DEBUG);

    while(true){
      const { value, done } = await reader.read();
      if(done) break;

      const text = decoder.decode(value, {stream:true});
      const lines = (leftover + text).split('\n');
      leftover = lines.pop();                // incomplete line stays in buffer

      for(const line of lines){
        if(!line.trim()) continue;
        let obj;
        try{ obj = JSON.parse(line); } catch{
          log(`Invalid JSON line: ${line}`, LOG_LEVELS.ERROR);
          continue;
        }

        const msg = obj.message || {};
        if(typeof msg.content === 'string')  onContent(msg.content);
        if(typeof msg.thinking === 'string') onThinking(msg.thinking);
      }
    }

    onDone();
    log('--- Stream NDJSON: END ---', LOG_LEVELS.DEBUG);
  }finally{
    reader.releaseLock();
  }
}

/* ----------  Request helper (with think flag)  ---------- */
async function sendRequest(isSelfHosted, think){
  const type   = document.getElementById('modelType').value;
  const model  = document.getElementById('modelSelect').value;
  const problem= document.getElementById('problem').value.trim();
  const budget = document.getElementById('budgetInput').value.trim();

  /* selected techs */
  const techs = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
                     .map(cb => cb.parentElement.textContent.trim());

  /* build prompt */
  const params = {
    problemStatement: problem,
    technologies: techs,
    budget,
    complexity: document.getElementById('complexity').value
  };
  const prompt = buildPrompt(params);

  /* raw body for logging */
  const rawBody = JSON.stringify({
    model,
    messages: [{role:'user', content:prompt}],
    temperature:0.8,
    max_tokens:2000
  });

  /* URL & headers */
  let url, headers;
  if(isSelfHosted){
    const base = document.getElementById('modelUrl').value.trim();
    url = `${base}/api/chat`;
    headers = {'Content-Type':'application/json'};
  }else{
    url = 'https://api.openai.com/v1/chat/completions';
    headers = {
      'Content-Type':'application/json',
      Authorization:`Bearer ${document.getElementById('apiKey').value.trim()}`
    };
  }

  /* payload – add think flag only for self‑hosted */
  const payload = JSON.parse(rawBody);
  if(isSelfHosted){
    payload.think = think;
    delete payload.response_format;
  }

  /* logging */
  const t0 = performance.now();
  log(`>>> POST ${url}`, LOG_LEVELS.INFO);
  log(`Request headers: ${JSON.stringify(headers)}`, LOG_LEVELS.DEBUG);
  const preview = payload ? JSON.stringify(payload).slice(0,80).replace(/\n/g,'\\n') : '—';
  log(`Request body (${payload?JSON.stringify(payload).length:0} bytes) – preview: "${preview}"`,
      LOG_LEVELS.DEBUG, LOG_VERBOSE()?JSON.stringify(payload):null);

  /* fetch */
  const resp = await fetch(url,{method:'POST',headers,body:JSON.stringify(payload)});

  /* response logging */
  const t1 = performance.now();
  log(`<<< ${resp.status} ${resp.statusText} – ${(t1-t0).toFixed(1)} ms`, LOG_LEVELS.INFO);
  const hdrs = [...resp.headers.entries()]
                 .map(([k,v])=>`${k}: ${v}`).join('\n');
  log(`Response headers:\n${hdrs}`, LOG_LEVELS.DEBUG);

  /* error path – read *entire* body as text */
  if(!resp.ok){
    const txt = await resp.text();
    let body;
    try{ body = JSON.parse(txt); } catch{ body = txt; }
    log(`Error body: ${JSON.stringify(body)}`, LOG_LEVELS.ERROR);
    throw {status:resp.status, body};
  }

  return resp;           // success – keep the stream open for downstream use
}

/* ----------  Form submit / streaming  ---------- */
document.getElementById('problemForm').addEventListener('submit', async e=>{
  e.preventDefault();

  const type   = document.getElementById('modelType').value;
  const model  = document.getElementById('modelSelect').value;
  const problem= document.getElementById('problem').value.trim();
  const budget = document.getElementById('budgetInput').value.trim();

  if(!type || !model || !problem || !budget){
    alert('All required fields must be filled.');
    return;
  }

  const isSelfHosted = type==='selfhosted';
  showSpinner(true);
  document.getElementById('results').innerHTML = '';
  const contentBuf  = [];   // accumulated content chunks
  const thinkingBuf = [];   // accumulated thinking chunks

  /* helpers to update DOM */
  const renderResults = ()=>{ 
    const html = marked.parse(contentBuf.join(''));
    document.getElementById('results').innerHTML = html;
  };
  const renderThinking = ()=>{
    const el = document.getElementById('thinkingLog');
    el.textContent = thinkingBuf.join('');
    el.scrollTop = el.scrollHeight;
    if(document.getElementById('thinkingContainer').classList.contains('hidden')){
      showThinkingCard(true);   // reveal card on first thought
    }
  };

  /* callbacks for streamNDJSON  */
  const onContent = chunk => { contentBuf.push(chunk); renderResults(); };
  const onThinking= chunk => { thinkingBuf.push(chunk); renderThinking(); };

  /* first attempt – think = true */
  try{
    log('--- Attempt 1: thinking=true ---', LOG_LEVELS.DEBUG);
    const resp = await sendRequest(isSelfHosted, true);
    await streamNDJSON(resp, onContent, onThinking, ()=>{ showSpinner(false); log('--- Streaming finished (thinking=true) ---', LOG_LEVELS.INFO); });
  }catch(err){
    /* retry without thinking if not supported */
    if(isSelfHosted && err.body && err.body.error &&
       /does not support thinking/.test(err.body.error)){
      log('Thinking unsupported – retrying with think=false', LOG_LEVELS.INFO);
      try{
        const resp = await sendRequest(isSelfHosted, false);
        await streamNDJSON(resp, onContent, onThinking, ()=>{ showSpinner(false); log('--- Streaming finished (thinking=false) ---', LOG_LEVELS.INFO); });
      }catch(e){
        console.error(e);
        log(`Retry failed – ${e.message||e}`, LOG_LEVELS.ERROR, e.stack);
        document.getElementById('results').innerHTML =
          `<p class="text-red-600">Retry error: ${JSON.stringify(e.body||e, null, 2)}</p>`;
        showSpinner(false);
      }
    }else{
      console.error(err);
      log(`Unhandled error: ${err.message||err}`, LOG_LEVELS.ERROR, err.stack);
      document.getElementById('results').innerHTML =
        `<p class="text-red-600">Error: ${JSON.stringify(err.body||err, null, 2)}</p>`;
      showSpinner(false);
    }
  }
});