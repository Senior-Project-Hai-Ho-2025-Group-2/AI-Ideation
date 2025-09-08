import { useState } from "react";

export default function App() {
  const [problem, setProblem] = useState("");
  const [tags, setTags] = useState("Embedded, IoT, LLM, Python");
  const [innovation, setInnovation] = useState("Balanced");
  const [budget, setBudget] = useState("$0-$1k");
  const [complexity, setComplexity] = useState("Beginner");
  const [n, setN] = useState(3);
  const [ideas, setIdeas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true); setError(""); setIdeas([]);
    try {
      const resp = await fetch("http://localhost:3001/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problem,
          tags: tags.split(",").map(s => s.trim()),
          innovation, budget, complexity, n
        })
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setIdeas(Array.isArray(data?.ideas) ? data.ideas : []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>AI Ideation Tool</h1>

      <div style={{ display: "grid", gap: 12 }}>
        <textarea placeholder="Problem (optional)" value={problem} onChange={e=>setProblem(e.target.value)} />
        <input value={tags} onChange={e=>setTags(e.target.value)} />
        <div>
          Innovation:
          <select value={innovation} onChange={e=>setInnovation(e.target.value)}>
            <option>Incremental</option><option>Balanced</option><option>Bold</option>
          </select>
        </div>
        <div>
          Budget:
          <select value={budget} onChange={e=>setBudget(e.target.value)}>
            <option>$0-$1k</option><option>$1k-$5k</option><option>$5k+</option>
          </select>
        </div>
        <div>
          Complexity:
          <select value={complexity} onChange={e=>setComplexity(e.target.value)}>
            <option>Beginner</option><option>Intermediate</option><option>Advanced</option>
          </select>
        </div>
        <div>Idea count: <input type="number" min="1" max="8" value={n} onChange={e=>setN(+e.target.value)} /></div>
        <button onClick={generate} disabled={loading}>{loading ? "Generating..." : "Generate"}</button>
        {error && <div style={{ color: "red" }}>{error}</div>}
      </div>

      <hr style={{ margin: "24px 0" }} />

      {!ideas.length && <p>No ideas yet.</p>}

      {ideas.map((i, idx) => (
        <div key={idx} style={{ border: "1px solid #ddd", padding: 16, borderRadius: 12, marginBottom: 12 }}>
          <h3>{i.title}</h3>
          <p>{i.summary}</p>
          <pre style={{ whiteSpace: "pre-wrap", background:"#f7f7f7", padding:12, borderRadius:8 }}>
{JSON.stringify(i, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  );
}
