import { GoogleGenAI } from "@google/genai";
import multer from "multer";
import express from "express";
import 'dotenv/config';
import supabase from "../client/supabase.js"
import { getAdminClient } from "../client/supabaseAdmin.js";


// initialize google ai with api Key
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
}).single("image");

// Phase 16 — canonical celebrity coach pool. Kept here as the single
// source of truth; the iOS client mirrors this list under
// FoodieAI/Features/Profile/CoachPreferencesView.swift. If you add a
// coach here, mirror it on the client. Reordering doesn't matter.
const deadCelebs = [
  "Albert Einstein",
  "Cleopatra",
  "Julius Caesar",
  "Shakespeare",
  "Frida Kahlo",
  "Bruce Lee",
  "Leonardo da Vinci",
  "Napoleon Bonaparte",
  "Amelia Earhart",
  "Marie Curie",
];

// Normalize a raw `preferred_coaches` payload into a deduped list of
// canonical coach names. Trims whitespace, drops empties, matches
// canonical names case-insensitively, and dedupes while preserving the
// caller's order. Non-canonical entries are dropped (the model can only
// voice the canonical pool).
function sanitizePreferred(preferred) {
  if (!Array.isArray(preferred)) return [];
  const canonicalByLower = new Map(deadCelebs.map(c => [c.toLowerCase(), c]));
  const seen = new Set();
  const out = [];
  for (const raw of preferred) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const canonical = canonicalByLower.get(trimmed.toLowerCase());
    if (!canonical) continue;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}

// Treat `preferred` as the allowed coach pool. The starred set is the
// user's explicit "use only these voices" choice — picking an unstarred
// coach would feel like the app ignored them. Empty preferences =>
// uniform random over the full canonical pool.
//   - 0 starred: uniform random across `deadCelebs`
//   - 1 starred: that coach, deterministically
//   - N starred: uniform random across those N
function pickCoach(preferred) {
  const prefs = sanitizePreferred(preferred);
  if (prefs.length === 0) {
    return deadCelebs[Math.floor(Math.random() * deadCelebs.length)];
  }
  return prefs[Math.floor(Math.random() * prefs.length)];
}

// Phase 16 — turn a recent_meals payload into a single context paragraph
// that prepends the analyze prompt. The payload is a JSON-stringified
// array of {food_name, eaten_at}. We bound the list to 14 entries
// server-side regardless of what the client sent, to keep prompt size
// predictable and the model focused.
function buildRecentMealsContext(rawJson) {
  if (!rawJson) return "";
  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch (e) {
    console.warn("[analyze] recent_meals not parseable JSON, ignoring");
    return "";
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return "";

  const cap = parsed.slice(0, 14);
  const formatted = cap
    .map(m => {
      const name = (m && m.food_name) ? String(m.food_name).slice(0, 80) : null;
      const when = m && m.eaten_at ? new Date(m.eaten_at) : null;
      if (!name) return null;
      const dayLabel = when && !isNaN(when.getTime())
        ? when.toLocaleDateString("en-US", { weekday: "long" })
        : null;
      return dayLabel ? `${name} on ${dayLabel}` : name;
    })
    .filter(Boolean);

  if (formatted.length === 0) return "";

  return [
    `The user has recently eaten: [${formatted.join(", ")}].`,
    `If the food in this image matches a meal they've had recently,`,
    `you may reference that pattern in your coach quote — but lightly,`,
    `never lecturing. Only mention patterns when genuinely useful;`,
    `most of the time the quote should sound like normal coach advice.`,
  ].join(" ");
}

// Quantity Clarification — format the optional `user_quantities` body
// field into a single context line for the analyze prompt. Mirrors
// `buildRecentMealsContext`: parse the JSON, defensively cap the list,
// and return empty string on any failure so the pre-clarification
// client keeps working.
function buildUserQuantitiesContext(rawJson) {
  if (!rawJson) return "";
  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch (e) {
    console.warn("[analyze] user_quantities not parseable JSON, ignoring");
    return "";
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return "";

  const cap = parsed.slice(0, 8);
  const formatted = cap
    .map(q => {
      const name = q && q.name ? String(q.name).slice(0, 80) : null;
      const qty  = q && q.quantity ? String(q.quantity).slice(0, 40) : null;
      if (!name || !qty) return null;
      return `${name}: ${qty}`;
    })
    .filter(Boolean);

  if (formatted.length === 0) return "";
  return `[${formatted.join(", ")}]`;
}

router.post("/analyze", upload, async (req, res) => {
  // Phase 16 — optional context inputs. Both are no-ops if absent so the
  // pre-Phase-16 client (or a curl with just `image`) keeps working.
  const recentMealsJson = req.body && req.body.recent_meals;
  const preferredJson   = req.body && req.body.preferred_coaches;
  const userQuantitiesJson = req.body && req.body.user_quantities;

  let preferred = [];
  if (preferredJson) {
    try { preferred = JSON.parse(preferredJson); } catch (_) { preferred = []; }
  }
  const celebName = pickCoach(preferred);

  const recentMealsContext = buildRecentMealsContext(recentMealsJson);
  const userQuantitiesContext = buildUserQuantitiesContext(userQuantitiesJson);

  try {
    const base64Image = req.file.buffer.toString("base64");

    const foodAnalysisFunc = {
        name: 'analyze_food_image',
        description: 'Analyzes food image and returns structured nutrition data. And separate the calories, carbs, and sugar in their own args. ',
        parameters: {
          type: 'object',
          properties: {
            fallback:{
                type: 'string',
                description: 'if food is detected then dont put anything here, else respond "No food detected'
            },
            coachAdvice: {
              type: 'string',
              description: 'The coach\'s humorous, witty, yet insightful advice about this food, in the coach\'s voice. Under 30 words. One short paragraph, no quotation marks wrapping the whole string.'
            },
            food: {
              type: 'string',
              description: 'Name of the food in the image and if multiple foods are detected then summarize briefly'
            },
            benefits: {
              type: 'array',
              items: { type: 'string' },
              description: '2-3 Health benefits of the food which body part will benefit e.g., [Make your skin glowing and can cure diseases if available] in one sentence. '
            },
            calories:{
              type:'number',
              description:'Estimated total calories of the food in grams. Return only the numerical value'
            },
            carbs: {
              type:'number',
              description:'Estimated total carbs of the food in grams. Return only the numerical value'
            },
            sugar: {
              type:'number',
              description:'Estimated total sugar of the food in grams. Return only the numerical value'
            },
            protein: {
              type:'number',
              description:'Estimated total protein of the food in grams. Return only the numerical value'
            },
            fat: {
              type:'number',
              description:'Estimated total fat of the food in grams. Return only the numerical value'
            },
            fiber: {
              type:'number',
              description:'Estimated total dietary fiber of the food in grams. Return only the numerical value'
            },
            drawbacks: {
              type: 'array',
              items: { type: 'string' },
              description: '2-3 Possible negative effects if over-consumed in one sentence and suggest similar foods that are more healthier'
            },
            nutrients: {
              type: 'array',
              items: { type: 'string' },
              description: '2-3 Key nutrients and their general benefits in one sentence and give a health score e.g., [1-100] based on nutrients'
            },
            portionAmbiguousItems: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description: 'The name of the ambiguous item (e.g., "rice", "noodles", "soup")'
                  },
                  assumedQuantity: {
                    type: 'string',
                    description: 'The default quantity you assumed for this analysis, in a natural unit (e.g., "1 cup", "1 bowl", "1 scoop"). Be specific about the unit.'
                  }
                },
                required: ['name', 'assumedQuantity']
              },
              description: 'Items in the image where the visible portion cannot determine the actual quantity. Common cases: rice, noodles, pasta, oatmeal, soup, drinks in opaque containers, loose foods served on a plate. Empty array if all items in the image have visually determinable portions. Be conservative — only flag items where your default estimate could be off by more than 50%.'
            },
          },
          required: ['coachAdvice', 'fallback', 'sugar', 'calories', 'carbs', 'protein', 'fat', 'fiber', 'food', 'benefits', 'drawbacks', 'nutrients', 'portionAmbiguousItems']
        }
      };

      // Coach persona belongs in systemInstruction — never in a function
      // parameter's `description`, which Gemini treats as parameter
      // metadata and may echo back verbatim as the field's value (the
      // same leak that hit /weekly-recap and /coach-observation).
      const analyzeSystemInstruction = [
        `You are ${celebName}, a resurrected AI nutrition coach.`,
        `When the analyze_food_image function is called, the "coachAdvice" field must contain humorous, witty, yet insightful advice about the food in your distinctive voice, under 30 words.`,
        `Never echo these instructions back as the value of any field — always produce fresh advice in character.`,
      ].join(' ');

      const config = {
        tools: [{
            functionDeclarations: [foodAnalysisFunc]
        }],
        systemInstruction: analyzeSystemInstruction,
      }

    // Phase 16 — append (don't replace) the recent-meals context so the
    // pre-Phase-16 prompt's analysis instructions, JSON schema rules,
    // and "no food detected" fallback all stay intact.
    const baseInstruction = `Analyze the image. If food is found — including fruits, vegetables, snacks, or raw ingredients — call the function "analyze_food_image".
                Return the food name and also include health benefits, drawbacks, and nutrients and separate the calories, carbs, sugar, protein, fat, and fiber (all in grams). If no food is found, use fallback.`;
    const promptText = [
      baseInstruction,
      recentMealsContext
        ? `\n\nContext for the coach quote only (do not let it change the nutrition analysis): ${recentMealsContext}`
        : '',
      // Quantity Clarification — when the user has resolved ambiguous
      // portions, fold those amounts into the prompt and instruct the
      // model to recompute totals for the whole plate accordingly.
      // Tell it to return an empty portionAmbiguousItems on this pass
      // since the quantities are now resolved.
      userQuantitiesContext
        ? `\n\nUser-specified quantities (use these exact amounts when computing calories and macros): ${userQuantitiesContext}. Recompute totals for the whole plate accordingly; items not listed keep their visually determined portions. Set portionAmbiguousItems to an empty array on this pass.`
        : '',
    ].filter(Boolean).join('');

    if (userQuantitiesContext) {
      console.log(`[analyze] coach=${celebName} with user_quantities=${userQuantitiesContext}`);
    } else if (recentMealsContext) {
      console.log(`[analyze] coach=${celebName} with ${recentMealsContext.length} chars of recent-meals context`);
    } else {
      console.log(`[analyze] coach=${celebName} no context`);
    }

    // Cold-start Gemini occasionally returns plain text instead of calling
    // the tool. One retry consistently warms it up. We keep the loop tight
    // (max 2 attempts, 400ms backoff) so a real "no structured response"
    // failure still surfaces quickly to the client.
    const callGemini = () => ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: [
        {
            role: 'user',
            parts:[
              { text: promptText },
              {
                  inlineData:{
                      mimeType: req.file.mimetype,
                      data: base64Image,
                  }
              }
            ]
        }
      ],
      config: config
    });

    let response = await callGemini();
    if (!response.functionCalls || response.functionCalls.length === 0) {
      console.warn('[analyze] cold-start: no functionCalls on attempt 1, retrying once');
      await new Promise(r => setTimeout(r, 400));
      response = await callGemini();
    }

    if(response.functionCalls && response.functionCalls.length > 0) {
        const functionCall = response.functionCalls[0];
        const {fallback} = functionCall.args;

        if(fallback && fallback.toLowerCase().includes('no food detected')){
            return res.json({analysis:
                {fallback: fallback},
            })
        }

        return res.json({
          analysis: functionCall.args,
          coach: celebName
        });
    } else {
        res.status(400).json({error: "No structured response received." })
    }

  } catch (error) {
    console.error("Error analyzing image:", error);
    res.status(500).json({ error: "Failed to analyze image" });
  }
});

// Phase 16 — generate a single short editorial observation in a coach's
// voice from the user's recent patterns. No image; the iOS Tracker tab
// posts this from `CoachObservationService.generateIfNeeded`.
//
// Request body (application/json):
//   {
//     "patterns": [
//       { "kind": "frequent", "subject": "Margherita Pizza",
//         "detail": "4 times in last 14 days, mostly Fridays" },
//       { "kind": "firstThisWeek", "subject": "Miso Soup",
//         "detail": null }
//     ],
//     "preferred_coaches": ["Albert Einstein", "Marcus Aurelius"]
//   }
//
// Response:
//   {
//     "coach_name": "Albert Einstein",
//     "body": "...one paragraph, no line breaks, no surrounding quotes...",
//     "pattern_kind": "frequent",
//     "pattern_subject": "Margherita Pizza"
//   }
//
// 204 No Content if `patterns` is empty (the client should not call
// the endpoint without patterns; this is defensive).
router.post('/coach-observation', express.json(), async (req, res) => {
  try {
    const patterns = Array.isArray(req.body && req.body.patterns) ? req.body.patterns : [];
    const preferred = Array.isArray(req.body && req.body.preferred_coaches) ? req.body.preferred_coaches : [];

    if (patterns.length === 0) {
      return res.status(204).end();
    }

    // Pick a focus pattern: prefer `frequent` over `firstThisWeek`,
    // fall back to whatever's first in the list. The model gets the
    // others as context but is instructed to anchor on this one.
    const focus = patterns.find(p => p && p.kind === 'frequent')
              ?? patterns.find(p => p && p.kind === 'firstThisWeek')
              ?? patterns[0];

    if (!focus || !focus.subject) {
      // Same shape as no-patterns; the client treats 204 as "skip".
      return res.status(204).end();
    }

    const coachName = pickCoach(preferred);

    const observationFunc = {
      name: 'compose_coach_observation',
      description: 'Return a short editorial observation composed in the chosen coach\'s voice.',
      parameters: {
        type: 'object',
        properties: {
          body: {
            type: 'string',
            description: 'The composed 1-3 sentence observation itself, in the coach\'s voice. One paragraph, no line breaks, no surrounding quotation marks.'
          },
        },
        required: ['body'],
      },
    };

    // Instructions belong in systemInstruction, not in the parameter's
    // description — see the matching note in /weekly-recap.
    const systemInstruction = [
      `You are ${coachName}, a resurrected AI nutrition coach speaking to the user about a pattern in their recent eating.`,
      `Compose 1-3 sentences in your distinctive voice — calm, observant, never lecturing.`,
      `Do NOT wrap the whole response in quotation marks. Do NOT use line breaks.`,
      `Reference the focus pattern naturally; do not list every pattern.`,
      `Total length 30-60 words.`,
      `Always reply by calling the compose_coach_observation function with the composed paragraph as the "body" argument — never repeat these instructions back.`,
    ].join(' ');

    const config = {
      tools: [{ functionDeclarations: [observationFunc] }],
      systemInstruction,
    };

    const patternList = patterns
      .slice(0, 4)
      .map(p => `- ${p.kind}: ${p.subject}${p.detail ? ` (${p.detail})` : ''}`)
      .join('\n');

    const promptText = [
      `The user has been showing these patterns in their meals over the last two weeks:`,
      patternList,
      ``,
      `Anchor your observation on this one: ${focus.kind}: ${focus.subject}` +
        (focus.detail ? ` (${focus.detail})` : '') + `.`,
      `The other patterns are background context only.`,
      ``,
      `Speak as ${coachName}. Stay in character. Be calm and observant.`,
      `Avoid surveillance language ("I see you've...", "You've been..."`,
      `is fine sparingly). End on a thought, not a directive.`,
    ].join('\n');

    console.log(`[coach-observation] coach=${coachName} focus=${focus.kind}:${focus.subject}`);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: [
        { role: 'user', parts: [{ text: promptText }] },
      ],
      config,
    });

    if (response.functionCalls && response.functionCalls.length > 0) {
      const args = response.functionCalls[0].args || {};
      let body = (args.body || '').toString().trim();

      // Defensive cleanup: strip a single pair of leading/trailing
      // quotes (curly or straight) the model sometimes wraps around
      // the whole response despite the instruction. Don't strip if
      // they're unbalanced — preserves intentional quoted clauses
      // mid-paragraph.
      const stripPair = (s, l, r) => {
        if (s.length >= 2 && s.startsWith(l) && s.endsWith(r)) {
          return s.slice(l.length, s.length - r.length).trim();
        }
        return s;
      };
      body = stripPair(body, '“', '”');
      body = stripPair(body, '"', '"');
      body = body.replace(/\s*\n\s*/g, ' ');

      if (!body) {
        return res.status(502).json({ error: 'Empty observation body from model' });
      }

      return res.json({
        coach_name: coachName,
        body,
        pattern_kind: focus.kind || null,
        pattern_subject: focus.subject || null,
      });
    }

    return res.status(502).json({ error: 'No structured response from model' });
  } catch (error) {
    console.error('Error generating coach observation:', error);
    return res.status(500).json({ error: 'Failed to generate observation' });
  }
});

// Phase 17 — generate the weekly recap (Sunday-evening editorial card).
//
// Request body (application/json):
//   {
//     "week_start": "2026-05-04",  // YYYY-MM-DD in user's timezone
//     "week_end":   "2026-05-10",
//     "meals": [
//       { "food_name": "...", "eaten_at": "...", "calories": ..,
//         "carbs": .., "sugar": .., "protein": .., "fat": .., "fiber": ..,
//         "mood": "loved" | "fine" | "tough" | null },
//       ...
//     ],
//     "patterns": [
//       { "kind": "frequent", "subject": "Margherita Pizza",
//         "detail": "4 times this week, mostly Fridays" }
//     ],
//     "preferred_coaches": ["Marcus Aurelius", "Albert Einstein"]
//   }
//
// Response:
//   { "coach_name": "...", "body": "...one paragraph, no quotes...",
//     "headline_stat": "23 meals · 14,200 calories",
//     "top_pattern": "Pizza, 4 times — mostly Fridays",
//     "mood_summary": "Three loved meals, four tough ones." }
//
// `mood_summary` is null when fewer than 3 meals carry a non-null
// `mood` label — not enough signal to summarize honestly.
//
// 204 No Content if `meals` is empty.
//
// Important:
//   - The system prompt explicitly forbids shame / "should" framing.
//   - The headline_stat is computed in JS, NOT asked of Gemini —
//     models hallucinate numbers; we have the raw meals array.
router.post('/weekly-recap', express.json({ limit: '512kb' }), async (req, res) => {
  try {
    // Improvement A — JWT auth. user_id is extracted from the verified
    // token, never trusted from the client body. Same pattern as
    // /account DELETE.
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or malformed authorization' });
    }
    const token = authHeader.slice(7);

    const { client: adminClient, error: clientError } = getAdminClient();
    if (clientError) {
      console.error('[weekly-recap]', clientError);
      return res.status(503).json({ error: 'Service temporarily unavailable' });
    }

    const { data: userData, error: verifyError } = await adminClient.auth.getUser(token);
    if (verifyError || !userData || !userData.user) {
      console.warn('[weekly-recap] token verification failed:', verifyError && verifyError.message);
      return res.status(401).json({ error: 'Invalid token' });
    }

    const userId = userData.user.id;

    const meals = Array.isArray(req.body && req.body.meals) ? req.body.meals : [];
    if (meals.length === 0) {
      return res.status(204).end();
    }
    const weekStart = (req.body && req.body.week_start) || null;
    const weekEnd   = (req.body && req.body.week_end)   || null;
    const patterns  = Array.isArray(req.body && req.body.patterns) ? req.body.patterns : [];
    const preferred = Array.isArray(req.body && req.body.preferred_coaches) ? req.body.preferred_coaches : [];

    if (!weekStart || !weekEnd) {
      return res.status(400).json({ error: 'week_start and week_end are required' });
    }

    // Improvement A — cache check before generating. Avoids redundant
    // Gemini calls when the same user foregrounds the app multiple
    // times within a week. The unique (user_id, week_start) index makes
    // this a fast point lookup.
    const { data: existing, error: cacheError } = await adminClient
      .from('weekly_recaps')
      .select('*')
      .eq('user_id', userId)
      .eq('week_start', weekStart)
      .maybeSingle();

    if (cacheError) {
      console.warn('[weekly-recap] cache check failed:', cacheError.message);
      // Don't abort — fall through to generation. Cache miss is
      // acceptable degradation; we'll still serve the user a recap.
    }

    if (existing) {
      console.log(`[weekly-recap] cache hit for user=${userId} week=${weekStart}`);
      return res.json({
        id: existing.id,
        coach_name: existing.coach_name,
        body: existing.body,
        headline_stat: existing.headline_stat,
        top_pattern: existing.top_pattern,
        mood_summary: existing.mood_summary,
        week_start: existing.week_start,
        week_end: existing.week_end,
        cached: true,
      });
    }

    // Server-computed totals. Gemini doesn't need to do arithmetic.
    let totalCalories = 0;
    let totalCarbs = 0, totalSugar = 0, totalProtein = 0, totalFat = 0, totalFiber = 0;
    for (const m of meals) {
      totalCalories += Number(m.calories) || 0;
      totalCarbs    += Number(m.carbs)    || 0;
      totalSugar    += Number(m.sugar)    || 0;
      totalProtein  += Number(m.protein)  || 0;
      totalFat      += Number(m.fat)      || 0;
      totalFiber    += Number(m.fiber)    || 0;
    }

    // Phase 18 — mood tally. Suppress mood_summary when fewer than 3
    // meals carry a label; otherwise feed the counts to the model and
    // ask for one editorial sentence.
    let loved = 0, fine = 0, tough = 0;
    for (const m of meals) {
      if (!m || typeof m.mood !== 'string') continue;
      if (m.mood === 'loved') loved++;
      else if (m.mood === 'fine') fine++;
      else if (m.mood === 'tough') tough++;
    }
    const labeledCount = loved + fine + tough;
    const moodEligible = labeledCount >= 3;

    const formattedCalories = Math.round(totalCalories).toLocaleString('en-US');
    const headlineStat = `${meals.length} meals · ${formattedCalories} calories`;

    const topPattern = formatTopPattern(patterns);
    const coachName = pickCoach(preferred);

    // JSON-mode output schema. Switched away from function/tool calling
    // because Gemini 2.5 Flash Lite was returning plain text instead of
    // calling the declared function under long prompts (mood context +
    // meal list + patterns), causing the endpoint to fail. responseMimeType
    // + responseSchema guarantees a JSON object back.
    const responseSchema = {
      type: 'object',
      properties: {
        body: {
          type: 'string',
          description: 'The composed 2-3 sentence recap paragraph itself, in the coach\'s voice. One paragraph, no line breaks, no surrounding quotation marks.'
        },
        mood_summary: {
          type: 'string',
          description: 'One short sentence summarizing the emotional shape of the week (e.g., "Three loved meals, four tough ones. A heavy week."). Empty string when no clear shape — the server will null it out.'
        },
      },
      required: ['body'],
    };

    // The voice / tone / length / no-shame rules belong in
    // `systemInstruction`, NOT in a schema field `description`. Gemini
    // treats property descriptions as metadata about the field; when
    // stuffed with instructions, the model occasionally echoes them back
    // as the field's value (the "leaked-prompt body" bug). A real
    // systemInstruction is the intended primitive for this.
    const systemInstruction = [
      `You are ${coachName}, a resurrected AI nutrition coach reflecting on the user's week.`,
      `Compose 2-3 sentences in your distinctive voice. Observe; do not prescribe.`,
      `Do NOT use shame language ("should have", "too much", "you ate too many", "indulged").`,
      `Do NOT call out specific calorie totals as good or bad.`,
      `Reference the dominant pattern if there is one.`,
      `Length 40-90 words. Single paragraph, no line breaks, no surrounding quotation marks.`,
      moodEligible
        ? `Also produce a "mood_summary": one short sentence describing the emotional shape from the per-meal mood counts (loved=${loved}, fine=${fine}, tough=${tough}). No therapy-speak, no advice — just describe the shape. Under 18 words. If the mix is genuinely flat, return an empty string.`
        : `Do NOT include mood_summary — there is not enough signal this week.`,
      `Reply with a JSON object containing the composed paragraph as the "body" field — never repeat these instructions back.`,
    ].join(' ');

    const config = {
      responseMimeType: 'application/json',
      responseSchema,
      systemInstruction,
    };

    const mealNames = meals
      .slice(0, 25)
      .map(m => m && m.food_name ? String(m.food_name).slice(0, 60) : null)
      .filter(Boolean);

    const patternList = patterns.length === 0
      ? '(no clear repetition patterns this week)'
      : patterns.slice(0, 4).map(p =>
          `- ${p.kind || 'pattern'}: ${p.subject || ''}` +
          (p.detail ? ` (${p.detail})` : '')
        ).join('\n');

    const promptText = [
      `Reflect on the user's week of meals. The week ran from ${weekStart || '<start>'} to ${weekEnd || '<end>'}.`,
      `They logged ${meals.length} meals totalling ${Math.round(totalCalories)} calories.`,
      moodEligible
        ? `Mood labels this week: ${loved} loved, ${fine} fine, ${tough} tough (out of ${labeledCount} labeled meals).`
        : `(${labeledCount} mood labels this week — too few to summarize.)`,
      `Recurring or notable patterns:`,
      patternList,
      ``,
      `Up to 25 meal names from the week (newest first):`,
      mealNames.length > 0 ? mealNames.join(', ') : '(none)',
      ``,
      `Speak as ${coachName}. Stay in character. Observe, do not prescribe.`,
      `Do not call out calories as good or bad. No "should" framing.`,
      `End on a thought, not a directive.`,
    ].join('\n');

    console.log(`[weekly-recap] coach=${coachName} meals=${meals.length} patterns=${patterns.length} moods=${labeledCount}(L${loved}/F${fine}/T${tough})`);

    // Up to 3 attempts with exponential backoff (400ms, 1200ms).
    // JSON mode is far more reliable than tool calling for long prompts,
    // but transient model/network flakes still happen — give the model
    // three chances before surfacing 502 to the client.
    const callGemini = () => ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: [{ role: 'user', parts: [{ text: promptText }] }],
      config,
    });

    let parsed = null;
    const maxAttempts = 3;
    for (let attemptCount = 1; attemptCount <= maxAttempts; attemptCount++) {
      try {
        const response = await callGemini();
        const candidate = JSON.parse(response.text);
        if (candidate && candidate.body) {
          parsed = candidate;
          break;
        }
        console.warn(`[weekly-recap] attempt ${attemptCount}: empty body in JSON response`);
      } catch (e) {
        console.warn(`[weekly-recap] attempt ${attemptCount}: ${e.message}`);
      }

      if (attemptCount < maxAttempts) {
        const delay = 400 * Math.pow(3, attemptCount - 1);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    if (!parsed || !parsed.body) {
      console.error(`[weekly-recap] all ${maxAttempts} attempts failed for user ${req.body && req.body.user_id ? req.body.user_id : '<unknown>'}`);
      return res.status(502).json({ error: 'Recap generation failed after multiple attempts' });
    }

    let body = parsed.body.toString().trim();

    // Defensive: strip a single pair of leading/trailing quotes the
    // model occasionally wraps despite instructions.
    const stripPair = (s, l, r) => {
      if (s.length >= 2 && s.startsWith(l) && s.endsWith(r)) {
        return s.slice(l.length, s.length - r.length).trim();
      }
      return s;
    };
    body = stripPair(body, '“', '”');
    body = stripPair(body, '"', '"');
    body = body.replace(/\s*\n\s*/g, ' ');

    if (!body) {
      return res.status(502).json({ error: 'Empty recap body from model' });
    }

    // Server enforces the <3-labels rule regardless of what the model
    // returned. Above the threshold, accept the model's sentence;
    // otherwise null.
    let moodSummary = null;
    if (moodEligible) {
      let raw = (parsed.mood_summary || '').toString().trim();
      raw = stripPair(raw, '“', '”');
      raw = stripPair(raw, '"', '"');
      raw = raw.replace(/\s*\n\s*/g, ' ');
      moodSummary = raw.length > 0 ? raw : null;
    }

    // Improvement A — server-side insert. iOS used to insert under the
    // user's JWT (RLS); now the server does it under service-role so
    // the cache check and write live in one place. The unique
    // (user_id, week_start) constraint is our race-condition safety
    // net: if a concurrent request beat us to it, return that row.
    const newRow = {
      user_id: userId,
      week_start: weekStart,
      week_end: weekEnd,
      coach_name: coachName,
      body,
      headline_stat: headlineStat,
      top_pattern: topPattern,
      mood_summary: moodSummary,
    };

    const { data: inserted, error: insertError } = await adminClient
      .from('weekly_recaps')
      .insert(newRow)
      .select()
      .single();

    if (insertError) {
      // 23505 = unique_violation. Another concurrent request landed
      // first — fetch and return the winner. The user doesn't care
      // which generation won; they just want their recap.
      if (insertError.code === '23505') {
        console.log(`[weekly-recap] race condition detected for user=${userId} week=${weekStart}; returning existing row`);
        const { data: raceWinner } = await adminClient
          .from('weekly_recaps')
          .select('*')
          .eq('user_id', userId)
          .eq('week_start', weekStart)
          .single();

        if (raceWinner) {
          return res.json({
            id: raceWinner.id,
            coach_name: raceWinner.coach_name,
            body: raceWinner.body,
            headline_stat: raceWinner.headline_stat,
            top_pattern: raceWinner.top_pattern,
            mood_summary: raceWinner.mood_summary,
            week_start: raceWinner.week_start,
            week_end: raceWinner.week_end,
            cached: true,
          });
        }
      }

      console.error('[weekly-recap] insert failed:', insertError);
      return res.status(500).json({ error: 'Failed to save recap' });
    }

    console.log(`[weekly-recap] generated and saved for user=${userId} week=${weekStart}`);

    return res.json({
      id: inserted.id,
      coach_name: inserted.coach_name,
      body: inserted.body,
      headline_stat: inserted.headline_stat,
      top_pattern: inserted.top_pattern,
      mood_summary: inserted.mood_summary,
      week_start: inserted.week_start,
      week_end: inserted.week_end,
      cached: false,
    });
  } catch (error) {
    console.error('Error generating weekly recap:', error);
    return res.status(500).json({ error: 'Failed to generate recap' });
  }
});

function formatTopPattern(patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) return null;
  // Prefer .frequent, fall back to whatever's first.
  const top = patterns.find(p => p && p.kind === 'frequent') || patterns[0];
  if (!top || !top.subject) return null;
  return top.detail
    ? `${top.subject} — ${top.detail}`
    : top.subject;
}

//here's my router for sending datat to the backend
router.post('/save', async(req, res) => {
  try {
    const {cal, sugar, carbs, userId, foodName} = req.body;

    if(!cal || !sugar || !carbs){
      return res.status(400).json({error: 'sugar, carbs, cal is required'})
    }
    const {data, error} = await supabase
    .from('food_logs')
    .insert([{
      calories: cal,
      carbs: carbs,
      sugar: sugar,
      user_id: userId,
      food_name: foodName
    }])

    if (error) throw error;

    return res.status(200).json({success: true, message: 'saved successfully!', data });
  } catch (error) {
    console.error('Error uploading post:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Stack:', error.stack);
  }
  return res.status(500).json({ error: error.message ||  'Internal server error',
      details: error,
   });
  }
})

//router to get the food data that is saved into the food logs
router.get('/getFoodLogs', async(req, res) => {
  const userId = req.query.userId;
  if(!userId){
    return res.status(400).json({error: 'no userId received!'})
  }

  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

  const {data, error} = await supabase
  .from('food_logs')
  .select('*')
  .eq('user_id', userId)
  .gte('created_at', start.toISOString())
  .lt('created_at', end.toISOString())
  .order('created_at', {ascending: false})

  if(error){
    console.error('error fetchin data from foodlogs', error)
    return;
  }

  const totals = data.reduce((acc, item) => {
    acc.totalCalories += item.calories || 0;
    acc.totalCarbs += item.carbs || 0;
    acc.totalSugar += item.sugar || 0;

    return acc;

  }, {totalCalories: 0, totalCarbs: 0, totalSugar: 0})

  return res.json({data, totals});
})
export default router;
