// Pre-model safety screen. Runs on the server so it can't be skipped by a
// modified client. Urgent and sensitive messages get a fixed, reviewed reply
// in the user's language instead of a generated one, and cost no quota.

export type Lang = 'en' | 'es' | 'fr' | 'zh' | 'te';
export type Screened = { kind: 'ok' } | { kind: 'urgent' | 'sensitive'; reply: string };

// Phrases are intentionally specific so "chest day" or "I'm starving, what
// should I eat?" are NOT flagged.
const URGENT = [
  /\bchest (pain|tightness|pressure)\b/i,
  /\b(can'?t|cannot|trouble|difficulty) breath(e|ing)\b/i,
  /\bshortness of breath\b/i,
  /\b(faint(ed|ing)?|pass(ed|ing) out|black(ed|ing)? out)\b/i,
  /\bheart attack\b/i,
  /\bsuicid/i,
  /\bkill myself\b/i,
  /\bself[- ]?harm\b/i,
  /\bwant to die\b/i,
  /dolor (de|en el) pecho/i, /no puedo respirar/i, /quiero morir/i, /hacerme da[ñn]o/i,
  /douleur (thoracique|dans la poitrine)/i, /je (ne )?peux pas respirer/i, /envie de mourir/i, /me suicider/i,
  /胸痛|胸口痛|呼吸困难|自杀|不想活/,
];

const SENSITIVE = [
  /\bstarv(e|ing) myself\b/i,
  /\bpurging\b(?! (my |the )?(pantry|closet|email|inbox|house|fridge|junk))/i,
  /\bpurge (after|my (food|meal|dinner|lunch))/i,
  /\bmake myself (throw up|vomit)\b/i,
  /\banorex/i,
  /\bbulimi/i,
  /\bbinge[- ]eat/i,
  /\blaxatives? (to|for) (lose|weight)/i,
  /\bpro[- ]?ana\b/i,
  /\binject(ing)? (steroid|hgh|testosterone)/i,
  /\bsteroid cycle\b/i,
  /anorexia|bulimia|purgar/i,
  /boulimie|anorexie/i,
  /厌食|暴食|催吐/,
];

const REPLIES: Record<Lang, { urgent: string; sensitive: string }> = {
  en: {
    urgent: "This sounds serious, and I can't help with it safely. If you may be in danger or having a medical emergency, call your local emergency number now (911 in the US). For an emotional crisis in the US, call or text 988. Please stop exercising and reach out to someone you trust.",
    sensitive: "I care about you getting this right, and this is a topic for a qualified professional rather than an AI. A doctor or registered dietitian can help safely. If food or body image feels hard, your doctor or a local eating-disorder helpline is a good place to start. I'm happy to help with gentle, sustainable habits whenever you want.",
  },
  es: {
    urgent: 'Esto suena grave y no puedo ayudarte con seguridad. Si estás en peligro o tienes una emergencia médica, llama ya al número de emergencias de tu país. Deja de hacer ejercicio y busca a alguien de confianza.',
    sensitive: 'Me importa que lo hagas bien, y este es un tema para un profesional cualificado, no para una IA. Un médico o dietista registrado puede ayudarte con seguridad. Estaré encantado de ayudarte con hábitos suaves y sostenibles cuando quieras.',
  },
  fr: {
    urgent: "Cela semble grave et je ne peux pas t'aider en toute sécurité. Si tu es en danger ou en urgence médicale, appelle immédiatement le numéro d'urgence de ton pays. Arrête l'exercice et contacte une personne de confiance.",
    sensitive: "Je tiens à ce que tu fasses les choses correctement, et ce sujet relève d'un professionnel qualifié, pas d'une IA. Un médecin ou un diététicien peut t'aider en sécurité. Je suis là pour des habitudes douces et durables quand tu veux.",
  },
  zh: {
    urgent: '这听起来很严重，我无法安全地提供帮助。如果你处于危险中或遇到医疗紧急情况，请立即拨打当地急救电话。请停止运动，并联系你信任的人。',
    sensitive: '我希望你能安全地做好这件事，这个话题应由合格的专业人士而不是AI来处理。医生或注册营养师可以安全地帮助你。如果你愿意，我可以帮你建立温和、可持续的习惯。',
  },
  te: {
    urgent: 'ఇది తీవ్రంగా అనిపిస్తోంది, దీనిలో నేను సురక్షితంగా సహాయం చేయలేను. మీరు ప్రమాదంలో ఉన్నా లేదా వైద్య అత్యవసర పరిస్థితిలో ఉన్నా, వెంటనే మీ స్థానిక అత్యవసర నంబర్‌కు కాల్ చేయండి. వ్యాయామం ఆపి, మీకు నమ్మకమైన వ్యక్తిని సంప్రదించండి.',
    sensitive: 'మీరు దీన్ని సరిగ్గా చేయాలని నేను కోరుకుంటున్నాను; ఇది AIకి కాదు, అర్హత కలిగిన నిపుణునికి సంబంధించిన విషయం. డాక్టర్ లేదా డైటీషియన్ సురక్షితంగా సహాయం చేయగలరు. మీరు కోరినప్పుడు సున్నితమైన, నిలకడైన అలవాట్లలో సహాయం చేస్తాను.',
  },
};

export function screenText(text: string, lang: Lang = 'en'): Screened {
  const r = REPLIES[lang] ?? REPLIES.en;
  if (URGENT.some(re => re.test(text))) return { kind: 'urgent', reply: r.urgent };
  if (SENSITIVE.some(re => re.test(text))) return { kind: 'sensitive', reply: r.sensitive };
  return { kind: 'ok' };
}

// Heuristic only: used to log and add a strike, never to block outright.
const INJECTION = /(ignore (all |any )?(previous|prior|above) (instructions|rules)|reveal (your|the) (system )?prompt|you are now (dan|an? unrestricted)|jailbreak|developer mode)/i;
export const looksLikeInjection = (text: string) => INJECTION.test(text);
