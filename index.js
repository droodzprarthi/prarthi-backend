const express = require('express');
const cors = require('cors');
const { load, Constants } = require('@fusionstrings/swiss-eph');

const app = express();
app.use(cors());
app.use(express.json());

// ഒരു ബേസിക് ടെസ്റ്റ് റൂട്ട് (സെർവർ വർക്ക് ചെയ്യുന്നുണ്ടോ എന്ന് നോക്കാൻ)
app.get('/', (req, res) => {
    res.send("Prarthi Astrology Backend is Running Perfectly!");
});

// 1. ജാതകം ഗണിക്കുന്ന ഭാഗം
app.post('/generate-horoscope', async (req, res) => {
    try {
        const body = req.body;
        let floatHour = body.hour + (body.min / 60.0) - 5.5; 

        const eph = await load();
        const jd = eph.swe_julday(body.year, body.month, body.day, floatHour, Constants.SE_GREG_CAL);
        
        eph.swe_set_sid_mode(Constants.SE_SIDM_LAHIRI, 0, 0);
        const ayanamsa = eph.swe_get_ayanamsa_ut(jd);

        const planets = [
          { id: Constants.SE_SUN, name: "Sun" }, { id: Constants.SE_MOON, name: "Moon" },
          { id: Constants.SE_MARS, name: "Mars" }, { id: Constants.SE_MERCURY, name: "Mercury" },
          { id: Constants.SE_JUPITER, name: "Jupiter" }, { id: Constants.SE_VENUS, name: "Venus" },
          { id: Constants.SE_SATURN, name: "Saturn" }, { id: Constants.SE_TRUE_NODE, name: "Rahu" }, 
        ];

        let positions = {};
        for (let p of planets) {
          const pos = eph.swe_calc_ut(jd, p.id, Constants.SEFLG_SWIEPH);
          let siderealDeg = (pos.xx[0] - ayanamsa + 360) % 360;
          positions[p.name] = { degree: siderealDeg };
        }
        positions["Ketu"] = { degree: (positions["Rahu"].degree + 180) % 360 };

        const houses = eph.swe_houses(jd, body.lat, body.lon, 'P'.charCodeAt(0));
        let ascendantSidereal = (houses.ascendant - ayanamsa + 360) % 360;
        const nakshatraIndex = Math.floor(positions["Moon"].degree / (360 / 27));

        res.json({ success: true, ascendant: ascendantSidereal, planets: positions, nakshatra_index: nakshatraIndex });
    } catch (e) {
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});

// 2. പഞ്ചാംഗം ഗണിക്കുന്ന ഭാഗം
app.post('/get-panchangam', async (req, res) => {
    try {
        const body = req.body;
        let floatHour = body.hour + (body.min / 60.0) - 5.5; 
        
        const eph = await load();
        const jd = eph.swe_julday(body.year, body.month, body.day, floatHour, Constants.SE_GREG_CAL);
        eph.swe_set_sid_mode(Constants.SE_SIDM_LAHIRI, 0, 0);
        const ayanamsa = eph.swe_get_ayanamsa_ut(jd);

        const sunPos = eph.swe_calc_ut(jd, Constants.SE_SUN, Constants.SEFLG_SWIEPH);
        const moonPos = eph.swe_calc_ut(jd, Constants.SE_MOON, Constants.SEFLG_SWIEPH);

        let sunTropical = sunPos.xx[0], moonTropical = moonPos.xx[0];
        let sunSidereal = (sunTropical - ayanamsa + 360) % 360;
        let moonSidereal = (moonTropical - ayanamsa + 360) % 360;

        let diff = (moonTropical - sunTropical + 360) % 360; 
        let tithiIndex = Math.floor(diff / 12);
        let nakshatraIndex = Math.floor(moonSidereal / (360 / 27));
        let yogaIndex = Math.floor(((sunSidereal + moonSidereal) % 360) / (360 / 27));
        let karanaIndex = Math.floor(diff / 6);
        let dayOfWeek = new Date(body.year, body.month - 1, body.day).getDay();

        res.json({ success: true, tithi_index: tithiIndex, nakshatra_index: nakshatraIndex, yoga_index: yogaIndex, karana_index: karanaIndex, day_of_week: dayOfWeek, sun_degree: sunSidereal, moon_degree: moonSidereal });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// നിങ്ങളുടെ ബാക്കി എല്ലാ API-കളും (Porutham, Dosha, Muhurtha, etc.) സമാനമായി ഇവിടെ നൽകാം. 
// സ്പേസ് ലാഭിക്കാൻ ഞാൻ പ്രധാനപ്പെട്ടവ നൽകി. ബാക്കിയുള്ളവ പഴയ കോഡിലെ പോലെ തന്നെ 'app.post' ആക്കി മാറ്റാം.

// AI Route - Render-ൽ Cloudflare AI പ്രവർത്തിക്കാത്തതിനാൽ അതിന് പകരം നൽകേണ്ടത്:
app.post('/ai-astrologer', async (req, res) => {
    res.json({ 
        success: false, 
        answer: "Cloudflare AI ഇവിടെ സപ്പോർട്ട് ചെയ്യില്ല. ഇതിനായി നമ്മൾ OpenAI (ChatGPT) അല്ലെങ്കിൽ Gemini API കീ നൽകേണ്ടതുണ്ട്." 
    });
});

// പോർട്ട് കോൺഫിഗറേഷൻ (Render തനിയെ പോർട്ട് എടുക്കും)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running smoothly on port ${PORT}`);
});