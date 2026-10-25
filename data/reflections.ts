// Short, original reflections shown after a break, one a day. They are written
// for this app (not quotes), so there is nothing to misattribute or license.
// Machine-translated like the rest of i18n/translations.ts; have a fluent
// speaker review es/fr/zh/te before relying on them.

export type ReflectionLang = 'en' | 'es' | 'fr' | 'zh' | 'te';

export const REFLECTIONS: Record<ReflectionLang, string[]> = {
  en: [
    'Nothing here needs you right now.',
    'You can come back to this in a minute.',
    'Rest is part of the work.',
    'A slow breath is a small act of kindness to yourself.',
    'You are allowed to pause.',
    'Notice how your shoulders just dropped.',
    'The next thing can wait one breath.',
    'Looking away is also a way of seeing clearly.',
    'Your attention is yours to give.',
    'Quiet is not empty. It is room.',
    'Be here for one more breath.',
    'You do not have to answer everything today.',
    'Soft eyes, soft jaw, soft hands.',
    'This moment is enough.',
  ],
  es: [
    'Nada aquí te necesita ahora mismo.',
    'Puedes volver a esto en un minuto.',
    'El descanso también es parte del trabajo.',
    'Una respiración lenta es un pequeño gesto de cariño hacia ti.',
    'Tienes permiso para parar.',
    'Fíjate en cómo se han soltado tus hombros.',
    'Lo siguiente puede esperar una respiración.',
    'Apartar la mirada también es una forma de ver con claridad.',
    'Tu atención es tuya y tú decides a quién dársela.',
    'El silencio no está vacío. Es espacio.',
    'Quédate aquí una respiración más.',
    'No tienes que responderlo todo hoy.',
    'Ojos suaves, mandíbula suave, manos suaves.',
    'Este momento es suficiente.',
  ],
  fr: [
    'Rien ici n\'a besoin de toi maintenant.',
    'Tu pourras y revenir dans une minute.',
    'Le repos fait partie du travail.',
    'Une respiration lente est une petite gentillesse envers toi-même.',
    'Tu as le droit de faire une pause.',
    'Remarque comme tes épaules viennent de se relâcher.',
    'La suite peut attendre le temps d\'une respiration.',
    'Détourner le regard, c\'est aussi une façon de voir clair.',
    'Ton attention t\'appartient.',
    'Le silence n\'est pas vide. C\'est de l\'espace.',
    'Reste encore une respiration.',
    'Tu n\'as pas à tout traiter aujourd\'hui.',
    'Yeux doux, mâchoire douce, mains douces.',
    'Ce moment suffit.',
  ],
  zh: [
    '此刻，这里没有什么需要你。',
    '一分钟后你还可以回来。',
    '休息也是工作的一部分。',
    '一次缓慢的呼吸，是对自己的一点温柔。',
    '你可以停下来。',
    '留意一下，你的肩膀刚刚放松了。',
    '下一件事可以等一次呼吸的时间。',
    '移开视线，也是一种看得更清楚的方式。',
    '你的注意力由你自己决定给谁。',
    '安静不是空的，而是留白。',
    '再多留一次呼吸。',
    '你不必今天回复所有事情。',
    '眼神放柔，下巴放松，双手放松。',
    '此刻已经足够。',
  ],
  te: [
    'ప్రస్తుతం ఇక్కడ ఏదీ మీ కోసం ఎదురుచూడటం లేదు.',
    'ఒక నిమిషం తర్వాత మీరు దీనికి తిరిగి రావచ్చు.',
    'విశ్రాంతి కూడా పనిలో భాగమే.',
    'నెమ్మదైన శ్వాస మీ పట్ల మీరు చూపే చిన్న దయ.',
    'మీరు ఆగడానికి అనుమతి ఉంది.',
    'మీ భుజాలు ఇప్పుడే ఎలా వదులయ్యాయో గమనించండి.',
    'తదుపరి పని ఒక శ్వాస వరకు ఆగగలదు.',
    'దూరంగా చూడటం కూడా స్పష్టంగా చూసే ఒక మార్గమే.',
    'మీ దృష్టి మీదే, ఎవరికి ఇవ్వాలో మీరే నిర్ణయించండి.',
    'నిశ్శబ్దం ఖాళీ కాదు. అది చోటు.',
    'ఇంకో శ్వాస వరకు ఇక్కడే ఉండండి.',
    'ఈరోజు ప్రతిదానికీ సమాధానం చెప్పాల్సిన అవసరం లేదు.',
    'మృదువైన కళ్లు, మృదువైన దవడ, మృదువైన చేతులు.',
    'ఈ క్షణం చాలు.',
  ],
};

// One reflection per calendar day, the same all day.
export function reflectionForDay(lang: string, now = new Date()): string {
  const list = REFLECTIONS[(lang as ReflectionLang) in REFLECTIONS ? (lang as ReflectionLang) : 'en'];
  const dayNumber = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 86_400_000);
  return list[((dayNumber % list.length) + list.length) % list.length];
}
