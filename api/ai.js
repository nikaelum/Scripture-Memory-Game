export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'API key not configured' });

  const { action, verse, reference, version, difficulty } = req.body;
  if (!verse) return res.status(400).json({ error: 'Verse text required' });

  try {
    let prompt = '';

    switch (action) {
      case 'chunk':
        prompt = buildChunkPrompt(verse, reference, version);
        break;
      case 'blanks':
        prompt = buildBlanksPrompt(verse, reference, difficulty);
        break;
      case 'hints':
        prompt = buildHintsPrompt(verse, reference);
        break;
      case 'analyze':
        prompt = buildAnalyzePrompt(verse, reference);
        break;
      default:
        prompt = buildChunkPrompt(verse, reference, version);
    }

    // Default to the specific model requested unless overridden in environment variables
    const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;

    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json'
        }
      })
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini error:', errText);
      return res.status(502).json({ error: 'AI service error', details: errText });
    }

    const data = await geminiRes.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.status(502).json({ error: 'Empty AI response' });
    }

    // Parse JSON from Gemini response
    let parsed;
    try {
      // Clean potential markdown code fences
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('JSON parse error:', text);
      return res.status(502).json({ error: 'Invalid AI response format', raw: text });
    }

    return res.status(200).json({ success: true, action, data: parsed });

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ============================================================
//  PROMPT BUILDERS
// ============================================================

function buildChunkPrompt(verse, reference, version) {
  return `You are a Bible memorization coach. Break this scripture verse into 
optimal memorization chunks for a student learning to memorize it.

VERSE: "${verse}"
REFERENCE: ${reference || 'Unknown'}
VERSION: ${version || 'Unknown'}

Rules for chunking:
1. Each chunk should be a natural phrase or clause (3-8 words ideal)
2. Never break in the middle of a meaningful phrase
3. Keep theological key terms together (e.g., "the Lord your God")
4. Consider Hebrew/Greek poetic parallelism if applicable
5. Each chunk should be independently meaningful
6. Provide a brief memory tip for each chunk
7. Suggest a logical grouping order for progressive memorization
8. Identify the "anchor words" — the most distinctive/important words

Return ONLY valid JSON in this exact format:
{
  "chunks": [
    {
      "id": 1,
      "text": "chunk text here",
      "wordCount": 5,
      "memoryTip": "brief tip to remember this part",
      "anchorWords": ["key", "words"],
      "difficulty": "easy|medium|hard"
    }
  ],
  "suggestedOrder": [1, 3, 2, 4],
  "totalChunks": 4,
  "verseStructure": "narrative|poetry|command|promise|declaration",
  "keyTheme": "brief theme description",
  "progressionStrategy": "description of how to learn this verse step by step"
}`;
}

function buildBlanksPrompt(verse, reference, difficulty) {
  const pct = difficulty || 30;
  return `You are a Bible memorization coach. Select the best words to blank out 
for a fill-in-the-blank memorization exercise.

VERSE: "${verse}"
REFERENCE: ${reference || 'Unknown'}
DIFFICULTY: ${pct}% of words should be blanked

Rules:
1. At ${pct}% difficulty, remove approximately ${pct}% of meaningful words
2. PRIORITIZE blanking theologically significant words
3. PRIORITIZE blanking words unique to this verse (not common words like "the, and, is")
4. At low difficulty (10-30%): blank only the most distinctive nouns/verbs
5. At medium difficulty (31-60%): also blank adjectives, key prepositions
6. At high difficulty (61-90%): blank most words except basic structure words
7. Never blank ALL words in a row — leave context anchors
8. Consider which words are hardest to recall from memory

The words of the verse (0-indexed): ${verse.split(/\s+/).map((w, i) => `[${i}]="${w}"`).join(', ')}

Return ONLY valid JSON:
{
  "blankIndices": [0, 3, 7],
  "blankWords": ["word1", "word2", "word3"],
  "reasoning": "brief explanation of why these words were chosen",
  "difficultyActual": 35,
  "keyTheologicalTerms": ["important", "terms"],
  "hints": {
    "0": "hint for word at index 0",
    "3": "hint for word at index 3"
  }
}`;
}

function buildHintsPrompt(verse, reference) {
  return `You are a Bible memorization coach. Generate helpful memorization hints 
and mnemonics for this verse.

VERSE: "${verse}"
REFERENCE: ${reference || 'Unknown'}

Return ONLY valid JSON:
{
  "mnemonics": [
    "mnemonic device or memory trick"
  ],
  "firstLetterAcronym": "F.L.A. — First Letter Acronym of key words",
  "visualImage": "description of a mental image to associate with this verse",
  "emotionalConnection": "what feeling or experience this verse connects to",
  "crossReferences": ["other related verses to connect mentally"],
  "keyPhrase": "the single most memorable phrase in this verse",
  "rhythmPattern": "description of any rhythmic or poetic pattern",
  "storyMethod": "a mini-story linking the concepts in order"
}`;
}

function buildAnalyzePrompt(verse, reference) {
  return `Analyze this Bible verse for memorization purposes.

VERSE: "${verse}"  
REFERENCE: ${reference || 'Unknown'}

Return ONLY valid JSON:
{
  "wordCount": 25,
  "estimatedMemorizationMinutes": 10,
  "difficultyScore": 6,
  "difficultyReason": "why this difficulty level",
  "literaryType": "narrative|poetry|epistle|prophecy|wisdom|law",
  "keyDoctrines": ["list of theological concepts"],
  "suggestedStartingDifficulty": 25,
  "vocabularyLevel": "simple|moderate|advanced",
  "repetitionNeeded": "estimated sessions to memorize",
  "bestTimeToReview": "suggested spaced repetition schedule"
}`;
}