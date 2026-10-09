export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth()+1).padStart(2,'0');
    const day = String(today.getDate()).padStart(2,'0');
    const dateStr = `${year}-${month}-${day}`;
    
    // Fetch from mondinfo.de
    const response = await fetch(`https://www.mondinfo.de/mondkalender/${dateStr}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = await response.text();
    
    // Parse moon phase
    let phase = "Unbekannt";
    if (html.includes("Zunehmender Mond")) phase = "Zunehmender Mond 🌒";
    else if (html.includes("Vollmond")) phase = "Vollmond 🌕";
    else if (html.includes("Abnehmender Mond")) phase = "Abnehmender Mond 🌘";
    else if (html.includes("Neumond")) phase = "Neumond 🌑";

    // Parse zodiac sign
    const signs = ["Widder","Stier","Zwilling","Krebs","Löwe","Jungfrau","Waage","Skorpion","Schütze","Steinbock","Wassermann","Fische"];
    const signEmojis = ["♈","♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓"];
    let sign = "Unbekannt";
    let signEmoji = "";
    for (let i=0; i<signs.length; i++) {
      if (html.includes(`>${signs[i]}<`)) {
        sign = signs[i];
        signEmoji = signEmojis[i];
        break;
      }
    }

    // Parse quality
    let quality = "Unbekannt";
    if (html.includes("Feuer")) quality = "🔥 Feuertag";
    else if (html.includes("Erde")) quality = "🌍 Erdtag";
    else if (html.includes("Luft")) quality = "💨 Lufttag";
    else if (html.includes("Wasser")) quality = "💧 Wassertag";
    else if (html.includes("Kältetag")) quality = "❄️ Kältetag";
    else if (html.includes("Wärmetag")) quality = "☀️ Wärmetag";
    else if (html.includes("Feuchtigkeitstag")) quality = "💧 Feuchtigkeitstag";

    // Parse direction
    let direction = "";
    if (html.includes("aufsteigend")) direction = "⬆️ aufsteigend";
    else if (html.includes("absteigend")) direction = "⬇️ absteigend";

    // Extract recommendations
    const recMatches = html.match(/<td[^>]*>\s*<a href="[^"]*">([^<]+)<\/a>\s*<\/td>/g) || [];
    const recommendations = recMatches.slice(0,6).map(m => {
      const match = m.match(/>([^<]+)<\/a>/);
      return match ? match[1].trim() : "";
    }).filter(Boolean);

    res.status(200).json({
      date: dateStr,
      phase,
      sign,
      signEmoji,
      quality,
      direction,
      recommendations,
      source: "mondinfo.de"
    });

  } catch(err) {
    res.status(500).json({ error: err.message });
  }
}
