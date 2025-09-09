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
}

/* ----------  Fetch self‑hosted model tags  --------- */
async function fetchModels(){
  const type = document.getElementById('modelType').value;
  const select = document.getElementById('modelSelect');
  document.getElementById('modelSelectField').classList.remove('hidden');

  if (type == 'openai') {
    const apiKey = document.getElementById('apiKey').value.trim();
    if (!apiKey) { return; }    // nothing to do yet – user hasn’t finished typing
    log(`Fetching models from https://api.openai.com/v1/models`, LOG_LEVELS.INFO);
    try {
      const resp = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      select.innerHTML = '';
      data.data.forEach((m) => {
        const opt = document.createElement('option');
        opt.value = m.id;                 // e.g. "gpt-3.5-turbo"
        opt.textContent = m.id;
        select.appendChild(opt);
      });
      log(`Fetched ${data.data.length} OpenAI models`, LOG_LEVELS.INFO);
    } catch (err) {
      console.error(err);
      log(`Error fetching OpenAI models: ${err.message}`, LOG_LEVELS.ERROR);
      select.innerHTML = '<option value="NaN">No Models Found</option>';    
    } 
  } else if (type == 'selfhosted') {
    const url = document.getElementById('modelUrl').value.trim();
    if (!url) { return; }       // nothing to do yet – user hasn’t finished typing
    log(`Fetching models from ${url}/api/tags`, LOG_LEVELS.INFO);
    try{
      const resp = await fetch(`${url}/api/tags`);
      if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      select.innerHTML = '';
      data.models.forEach(m=>{
        const opt = document.createElement('option');
        opt.value = m.name; opt.textContent = m.name; select.appendChild(opt);
      });
      log(`Fetched ${data.models.length} models`, LOG_LEVELS.INFO);
    }catch(err){
      console.error(err); 
      select.innerHTML = '<option value="NaN">No Models Found</option>';  
      log(`Error fetching models: ${err.message}`, LOG_LEVELS.ERROR);
    }
  }
}

/**
 * Split a Markdown string into an array of sections.
 * A section starts at a line that begins with `## ` (top‑level heading)
 * and continues until the next heading.
 *
 * @param {string} mdText
 * @returns {string[]} – array of Markdown sections
 */
function splitIntoIdeas(mdText) {
  const lines = mdText.split('\n');
  const sections = [];
  let current = [];

  for (const line of lines) {
    if (/^##\s/.test(line)) {           // new top‑level heading
      if (current.length) sections.push(current.join('\n'));
      current = [line];                 // start new section
    } else {
      current.push(line);
    }
  }

  if (current.length) sections.push(current.join('\n'));
  return sections;
}

/* ------------  Prompt builder  ------------------- */
function buildPrompt(params){
  let prompt = `Generate ${params.numOfIdeas} innovative senior design project ideas for computer engineering students with these specifications:
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
Format each project clearly with headers and bullet points. 
Use markdown to format your response. 
Start each new project with a level 2 header (##).
Only output the project ideas. Any extra information will be lost.`;

  return prompt;
}

/* ----------  Show/Hide the thinking card  ---------- */
function showThinkingCard(show){
  const card = document.getElementById('thinkingContainer');
  card.classList.toggle('hidden', !show);
}

/* ------------------------------------------------------------------
   1. Download the current Markdown into a .md file
------------------------------------------------------------------- */
function downloadMarkdown(mdContent){
  const blob = new Blob([mdContent], {type:'text/markdown'});
  const url  = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;

  /* ----  Pick a nice filename ---- */
  const filename = `ideation_${Date.now()}.md`;

  a.download = filename;
  document.body.appendChild(a);
  a.click();          // trigger the download
  document.body.removeChild(a);

  URL.revokeObjectURL(url);   // cleanup
}

/* ------------------------------------------------------------------
   2. Add the “Download Markdown” button to the results area
------------------------------------------------------------------- */
function addDownloadButton(mdContent){
  const container = document.getElementById('results');

  // Remove an old button if it already exists
  const old = document.getElementById('downloadMdBtn');
  if (old) old.remove();

  const btn = document.createElement('button');
  btn.id = 'downloadMdBtn';
  btn.className = 'btn btn-sm mt-2';
  btn.innerHTML = '<i class="fas fa-download"></i> Download Markdown';

  btn.addEventListener('click', () => downloadMarkdown(mdContent));
  container.appendChild(btn);
}

/**
 * Returns an `onDone` callback that
 *   • logs a custom message
 *   • adds the “Download Markdown” button
 *
 * @param {string} logMsg      – message to log when the stream finishes
 * @param {string[]} contentBuffer – array of Markdown chunks already being collected
 */
function createOnDone(logMsg, contentBuffer) {
  return function () {
    log(logMsg, LOG_LEVELS.INFO);                 // 1️⃣  Log the finished message
    addDownloadButton(contentBuffer.join(''));    // 2️⃣  Add the download button
    showSpinner(false);                           // Spinner off
  };
}

/* === main.js – streamNDJSON (self‑hosted + OpenAI) === */
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
      leftover = lines.pop();                     // keep incomplete tail

      for(const raw of lines){
        const line = raw.trim();
        if(!line) continue;

        /* -------------  OpenAI sentinel ------------- */
        if(line === 'data: [DONE]'){
          onDone();
          log('--- Stream NDJSON: END (DONE) ---', LOG_LEVELS.DEBUG);
          return;
        }

        /* -------------  Determine JSON payload ------------- */
        const isOpenAI = line.startsWith('data: ');
        const jsonStr = isOpenAI ? line.substring('data: '.length) : line;

        let obj;
        try{ obj = JSON.parse(jsonStr); } catch(e){
          log(`Invalid JSON line: ${jsonStr}`, LOG_LEVELS.ERROR, e);
          continue;
        }

        /* -------------  Self‑hosted finish flag ------------- */
        if(obj.done === true){
          onDone();
          log('--- Stream NDJSON: END (self‑hosted DONE) ---', LOG_LEVELS.DEBUG);
          return;
        }

        /* -------------  Pick the message payload ------------- */
        const msg = obj.message ?? obj.choices?.[0]?.delta ?? {};

        /* -------------  Forward chunks ------------- */
        if(typeof msg.content === 'string')   onContent(msg.content);
        if(typeof msg.thinking === 'string')  onThinking(msg.thinking);
      }
    }

    /* Normal close – no sentinel seen */
    onDone();
    log('--- Stream NDJSON: END (normal close) ---', LOG_LEVELS.DEBUG);
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
  const numOfIdeas = document.getElementById('numOfIdeas').value.trim();

  /* selected techs */
  const techs = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
                     .map(cb => cb.parentElement.textContent.trim());

  /* build prompt */
  const params = {
    problemStatement: problem,
    technologies: techs,
    budget,
    numOfIdeas,
    complexity: document.getElementById('complexity').value
  };
  const prompt = buildPrompt(params);

  /* raw body for logging */
  const rawBody = JSON.stringify({
    model,
    messages: [{role:'user', content:prompt}],
    temperature:1,
    stream:true,
  });
  /* Set the correct token key based on the provider */
  const tokenKey = isSelfHosted ? 'max_tokens' : 'max_completion_tokens';
  rawBody[tokenKey] = 2000;

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
  log(`Request body (${payload?JSON.stringify(payload).length:0} bytes) – payload: "${JSON.stringify(payload)}"`, LOG_LEVELS.DEBUG);

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
    const mdText = contentBuf.join('');
    const sections = splitIntoIdeas(mdText);   // array of Markdown strings

    const resultsEl = document.getElementById('results');
    resultsEl.innerHTML = '';                 // clear previous results

    sections.forEach((section, idx) => {
      const html = marked.parse(section);
      const collapsible = `
        <details open class="project-details mb-4 rounded-lg border border-gray-200">
          <summary class="cursor-pointer bg-gray-100 px-4 py-2 font-medium text-indigo-600">
            <i class="fas fa-caret-right mr-2"></i>
            <span>Idea ${idx + 1}</span>
          </summary>
          <div class="p-4 bg-white">
            ${html}
          </div>
        </details>
      `;
      resultsEl.insertAdjacentHTML('beforeend', collapsible);
    });
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

  if (type==='openai'){
    try{
      log('--- Sending request to OpenAI ---', LOG_LEVELS.DEBUG);
      const resp = await sendRequest(isSelfHosted, false);
      await streamNDJSON(resp, onContent, onThinking, createOnDone('--- OpenAI Stream Closed ---', contentBuf));
    } catch(err) {
      console.error(err);
      log(`request returned error: ${err.message||err}`, LOG_LEVELS.ERROR);
    }
  } else if (type==='selfhosted') {
    /* first attempt – think = true */
    try{
      log('--- Attempt 1: thinking=true ---', LOG_LEVELS.DEBUG);
      const resp = await sendRequest(isSelfHosted, true);
      await streamNDJSON(resp, onContent, onThinking, createOnDone('--- Ollama Stream Closed (thinking=true) ---', contentBuf));
    }catch(err){
      /* retry without thinking if not supported */
      if(isSelfHosted && err.body && err.body.error &&
        /does not support thinking/.test(err.body.error)){
        log('Thinking unsupported – retrying with think=false', LOG_LEVELS.INFO);
        try{
          const resp = await sendRequest(isSelfHosted, false);
          await streamNDJSON(resp, onContent, onThinking, createOnDone('--- Ollama Stream Closed (thinking=false) ---', contentBuf));
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
  }
});