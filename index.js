const express = require('express');
const cors = require('cors');
const swisseph = require('swisseph');

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// MAGIC WRAPPER: Unified & Consistent Code
// ==========================================
const Constants = swisseph;
const eph = {
    swe_julday: (year, month, day, hour, cal) => swisseph.swe_julday(year, month, day, hour, cal),
    swe_set_sid_mode: (mode, t0, ayan_t0) => swisseph.swe_set_sid_mode(mode, t0, ayan_t0),
    swe_get_ayanamsa_ut: (jd) => swisseph.swe_get_ayanamsa_ut(jd),
    swe_calc_ut: (jd, body, flags) => {
        const res = swisseph.swe_calc_ut(jd, body, flags);
        return { xx: [res.longitude, res.latitude, res.distance, res.speedInLong, res.speedInLat, res.speedInDist] };
    },
    swe_houses: (jd, lat, lon, system) => {
        const sysChar = typeof system === 'number' ? String.fromCharCode(system) : system;
        const res = swisseph.swe_houses(jd, lat, lon, sysChar);
        return { ascendant: res.ascendant };
    }
};
const load = async () => eph;

// സെർവർ വർക്ക് ചെയ്യുന്നുണ്ടോ എന്ന് പരിശോധിക്കാനുള്ള വഴി
app.get('/', (req, res) => {
    res.send("Prarthi Astrology Backend is Running Perfectly with Native SwissEph!");
});

// ==========================================
// 1. ജാതകം ഗണിക്കുന്ന ഭാഗം (Horoscope API)
// ==========================================
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

        res.status(200).json({ success: true, ascendant: ascendantSidereal, planets: positions, nakshatra_index: nakshatraIndex });
    } catch (e) {
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});

// ==========================================
// 2. പഞ്ചാംഗം ഗണിക്കുന്ന ഭാഗം (Panchangam API)
// ==========================================
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

        res.status(200).json({ success: true, tithi_index: tithiIndex, nakshatra_index: nakshatraIndex, yoga_index: yogaIndex, karana_index: karanaIndex, day_of_week: dayOfWeek, sun_degree: sunSidereal, moon_degree: moonSidereal });
    } catch (e) {
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});

// ==========================================
// 3. പൊരുത്തം നോക്കാനുള്ള ഭാഗം (Marriage Matching API)
// ==========================================
app.post('/calculate-porutham', async (req, res) => {
    try {
        const body = req.body;
        const eph = await load();
        eph.swe_set_sid_mode(Constants.SE_SIDM_LAHIRI, 0, 0);

        const getAstroDetails = (person) => {
          let floatHour = person.hour + (person.min / 60.0) - 5.5; 
          const jd = eph.swe_julday(person.year, person.month, person.day, floatHour, Constants.SE_GREG_CAL);
          const ayanamsa = eph.swe_get_ayanamsa_ut(jd);
          
          const moonPos = eph.swe_calc_ut(jd, Constants.SE_MOON, Constants.SEFLG_SWIEPH);
          let moonSidereal = (moonPos.xx[0] - ayanamsa + 360) % 360;
          
          let nakshatraIndex = Math.floor(moonSidereal / (360 / 27));
          let pada = Math.floor((moonSidereal % (360 / 27)) / (360 / 108)) + 1;
          let rasiIndex = Math.floor(moonSidereal / 30) + 1; 

          return { nakshatra_index: nakshatraIndex, pada: pada, rasi_index: rasiIndex, moon_degree: moonSidereal };
        };

        res.status(200).json({ success: true, boy: getAstroDetails(body.boy), girl: getAstroDetails(body.girl) });
    } catch (e) {
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});

// ==========================================
// 4. സമ്പൂർണ്ണ ദോഷ നിർണ്ണയം
// ==========================================
app.post('/calculate-dosha', async (req, res) => {
    try {
        const body = req.body;
        let floatHour = body.hour + (body.min / 60.0) - 5.5;

        const eph = await load();
        const jd = eph.swe_julday(body.year, body.month, body.day, floatHour, Constants.SE_GREG_CAL);
        eph.swe_set_sid_mode(Constants.SE_SIDM_LAHIRI, 0, 0);
        const ayanamsa = eph.swe_get_ayanamsa_ut(jd);

        const getPos = (id, targetJd = jd) => {
           let p = eph.swe_calc_ut(targetJd, id, Constants.SEFLG_SWIEPH);
           let targetAyanamsa = eph.swe_get_ayanamsa_ut(targetJd);
           return (p.xx[0] - targetAyanamsa + 360) % 360;
        };

        const planets = {
          Sun: getPos(Constants.SE_SUN), Moon: getPos(Constants.SE_MOON), Mars: getPos(Constants.SE_MARS), 
          Mercury: getPos(Constants.SE_MERCURY), Jupiter: getPos(Constants.SE_JUPITER), Venus: getPos(Constants.SE_VENUS),
          Saturn: getPos(Constants.SE_SATURN), Rahu: getPos(Constants.SE_TRUE_NODE),
        };
        planets.Ketu = (planets.Rahu + 180) % 360;

        const houses = eph.swe_houses(jd, body.lat, body.lon, 'P'.charCodeAt(0));
        let ascendant = (houses.ascendant - ayanamsa + 360) % 360;

        let ascRasi = Math.floor(ascendant / 30) + 1, moonRasi = Math.floor(planets.Moon / 30) + 1;
        let sunRasi = Math.floor(planets.Sun / 30) + 1, marsRasi = Math.floor(planets.Mars / 30) + 1;
        let jupiterRasi = Math.floor(planets.Jupiter / 30) + 1, saturnRasi = Math.floor(planets.Saturn / 30) + 1;
        let rahuRasi = Math.floor(planets.Rahu / 30) + 1, ketuRasi = Math.floor(planets.Ketu / 30) + 1;
        let nakshatraIndex = Math.floor(planets.Moon / (360 / 27));

        const getHouseDifference = (startRasi, targetRasi) => (targetRasi - startRasi + 12) % 12 + 1;
        
        let marsFromAsc = getHouseDifference(ascRasi, marsRasi), marsFromMoon = getHouseDifference(moonRasi, marsRasi);
        const manglikHouses = [1, 2, 4, 7, 8, 12];
        let isManglikAsc = manglikHouses.includes(marsFromAsc), isManglikMoon = manglikHouses.includes(marsFromMoon);
        let hasManglikDosha = isManglikAsc || isManglikMoon;

        let minRK = Math.min(planets.Rahu, planets.Ketu), maxRK = Math.max(planets.Rahu, planets.Ketu);
        let allInOneHalf = true, allInOtherHalf = true;
        ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'].forEach(p => {
           let deg = planets[p];
           if (!(deg > minRK && deg < maxRK)) allInOneHalf = false;
           if ((deg > minRK && deg < maxRK)) allInOtherHalf = false;
        });
        let hasKaalSarp = allInOneHalf || allInOtherHalf;
        let hasPitraDosha = (sunRasi === rahuRasi || sunRasi === ketuRasi);

        const now = new Date();
        const currentJd = eph.swe_julday(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(), now.getUTCHours() + now.getUTCMinutes() / 60.0, Constants.SE_GREG_CAL);
        let transitSaturnDeg = getPos(Constants.SE_SATURN, currentJd);
        let currentSaturnRasi = Math.floor(transitSaturnDeg / 30) + 1;
        let saturnFromMoon = getHouseDifference(moonRasi, currentSaturnRasi);

        let isSadeSati = [12, 1, 2].includes(saturnFromMoon), isKandakaSani = [4, 7, 10].includes(saturnFromMoon);
        let isAshtamaSani = (saturnFromMoon === 8);
        let hasSaniDosha = isSadeSati || isKandakaSani || isAshtamaSani;
        let hasGandmool = [0, 8, 9, 17, 18, 26].includes(nakshatraIndex);
        let hasGuruChandal = (jupiterRasi === rahuRasi || jupiterRasi === ketuRasi);
        let hasGrahan = (sunRasi === rahuRasi || sunRasi === ketuRasi || moonRasi === rahuRasi || moonRasi === ketuRasi);
        let hasVish = (moonRasi === saturnRasi);

        let rasi12FromMoon = ((moonRasi - 1 - 1 + 12) % 12) + 1, rasi2FromMoon = ((moonRasi - 1 + 1) % 12) + 1; 
        let kemadrumaPlanets = ['Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'], hasPlanetIn2_12 = false;
        for (let p of kemadrumaPlanets) {
           let pRasi = Math.floor(planets[p] / 30) + 1;
           if (pRasi === rasi12FromMoon || pRasi === rasi2FromMoon) { hasPlanetIn2_12 = true; break; }
        }
        let hasKemadruma = !hasPlanetIn2_12;

        res.status(200).json({
          success: true,
          manglik_dosha: { has_dosha: hasManglikDosha, from_ascendant: isManglikAsc, from_moon: isManglikMoon, mars_position: marsFromAsc },
          kaal_sarp_dosha: { has_dosha: hasKaalSarp }, pitra_dosha: { has_dosha: hasPitraDosha },
          sani_dosha: { has_dosha: hasSaniDosha, is_sade_sati: isSadeSati, is_kandaka_sani: isKandakaSani, is_ashtama_sani: isAshtamaSani },
          gandmool_dosha: { has_dosha: hasGandmool }, guru_chandal_dosha: { has_dosha: hasGuruChandal },
          grahan_dosha: { has_dosha: hasGrahan }, vish_dosha: { has_dosha: hasVish }, kemadruma_dosha: { has_dosha: hasKemadruma }
        });
    } catch (e) {
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});

// ==========================================
// 5. ഹോര, ഗൗരീ & കാലങ്ങൾ
// ==========================================
app.post('/calculate-muhurtha', async (req, res) => {
    try {
        const body = req.body;
        let lat = body.lat || 9.9312, lon = body.lon || 76.2673;

        const eph = await load();
        let jd = eph.swe_julday(body.year, body.month, body.day, 6.5, Constants.SE_GREG_CAL);
        let sunPos = eph.swe_calc_ut(jd, Constants.SE_SUN, Constants.SEFLG_SWIEPH);
        let sunLon = sunPos.xx[0]; 

        let deg2rad = Math.PI / 180, rad2deg = 180 / Math.PI;
        let declination = Math.asin(Math.sin(sunLon * deg2rad) * Math.sin(23.439 * deg2rad)) * rad2deg;
        let cosH = -Math.tan(lat * deg2rad) * Math.tan(declination * deg2rad);
        cosH = Math.max(-1, Math.min(1, cosH));
        let H = Math.acos(cosH) * rad2deg; 
        
        let transit = 12.0 - (lon / 15.0) + 5.5, hoursFromTransit = H / 15.0;
        let sunrise = transit - hoursFromTransit, sunset = transit + hoursFromTransit;  
        let dayLength = sunset - sunrise, nightLength = 24.0 - dayLength;

        const dayOfWeek = new Date(body.year, body.month - 1, body.day).getDay(); 

        const horaLords = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"];
        const planetsMalayalam = { "Sun": "സൂര്യൻ", "Venus": "ശുക്രൻ", "Mercury": "ബുധൻ", "Moon": "ചന്ദ്രൻ", "Saturn": "ശനി", "Jupiter": "വ്യാഴം", "Mars": "ചൊവ്വ" };
        const horaStatus = { "Sun": "അശുഭം", "Venus": "ശുഭം", "Mercury": "ശുഭം", "Moon": "ശുഭം", "Saturn": "അശുഭം", "Jupiter": "ശുഭം", "Mars": "അശുഭം" };

        const formatTime = (decTime) => {
            let h = Math.floor(decTime) % 24, m = Math.floor((decTime - Math.floor(decTime)) * 60);
            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        };

        let horaList = [];
        let dayHoraLen = dayLength / 12.0, nightHoraLen = nightLength / 12.0;
        
        let currTime = sunrise;
        for(let i = 0; i < 12; i++) {
           let pIndex = (dayOfWeek + i * 5) % 7, endTime = currTime + dayHoraLen;
           horaList.push({ time: `${formatTime(currTime)} - ${formatTime(endTime)}`, planet: planetsMalayalam[horaLords[pIndex]], status: horaStatus[horaLords[pIndex]] });
           currTime = endTime;
        }
        for(let i = 12; i < 24; i++) {
           let pIndex = (dayOfWeek + i * 5) % 7, endTime = currTime + nightHoraLen;
           horaList.push({ time: `${formatTime(currTime)} - ${formatTime(endTime)}`, planet: planetsMalayalam[horaLords[pIndex]], status: horaStatus[horaLords[pIndex]] });
           currTime = endTime;
        }

        const gowriNames = ["ഉദ്വേഗം (അശുഭം)", "ചരം (മധ്യമം)", "ലാഭം (ശുഭം)", "അമൃതം (അത്യുത്തമം)", "കാലം (അശുഭം)", "ശുഭം (ശുഭം)", "രോഗം (അശുഭം)"];
        const dayOffsets = [0, 3, 6, 2, 5, 1, 4], nightOffsets = [5, 1, 4, 0, 3, 6, 2];

        let gowriDay = [], gowriNight = [];
        let dayGowriLen = dayLength / 8.0, nightGowriLen = nightLength / 8.0;

        currTime = sunrise;
        for(let i = 0; i < 8; i++) {
           let endTime = currTime + dayGowriLen;
           gowriDay.push({ time: `${formatTime(currTime)} - ${formatTime(endTime)}`, name: gowriNames[(dayOffsets[dayOfWeek] + i) % 7] });
           currTime = endTime;
        }
        currTime = sunset;
        for(let i = 0; i < 8; i++) {
           let endTime = currTime + nightGowriLen;
           gowriNight.push({ time: `${formatTime(currTime)} - ${formatTime(endTime)}`, name: gowriNames[(nightOffsets[dayOfWeek] + i) % 7] });
           currTime = endTime;
        }

        let segmentLen = dayLength / 8.0;
        let rahuIndex = [7, 1, 6, 4, 5, 3, 2][dayOfWeek], gulikaIndex = [6, 5, 4, 3, 2, 1, 0][dayOfWeek], yamaIndex = [4, 3, 2, 1, 0, 6, 5][dayOfWeek];
        let rahuTime = `${formatTime(sunrise + rahuIndex * segmentLen)} - ${formatTime(sunrise + (rahuIndex + 1) * segmentLen)}`;
        let gulikaTime = `${formatTime(sunrise + gulikaIndex * segmentLen)} - ${formatTime(sunrise + (gulikaIndex + 1) * segmentLen)}`;
        let yamaTime = `${formatTime(sunrise + yamaIndex * segmentLen)} - ${formatTime(sunrise + (yamaIndex + 1) * segmentLen)}`;

        res.status(200).json({ success: true, hora: horaList, gowri_day: gowriDay, gowri_night: gowriNight, kaalangal: { rahu: rahuTime, gulika: gulikaTime, yama: yamaTime } });
    } catch (e) {
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});

// ==========================================
// 6. വിംശോത്തരി ദശ
// ==========================================
app.post('/calculate-dasha', async (req, res) => {
    try {
        const body = req.body;
        let floatHour = body.hour + (body.min / 60.0) - 5.5; 

        const eph = await load();
        const jd = eph.swe_julday(body.year, body.month, body.day, floatHour, Constants.SE_GREG_CAL);
        eph.swe_set_sid_mode(Constants.SE_SIDM_LAHIRI, 0, 0);
        const ayanamsa = eph.swe_get_ayanamsa_ut(jd);

        const moonPos = eph.swe_calc_ut(jd, Constants.SE_MOON, Constants.SEFLG_SWIEPH);
        let moonSidereal = (moonPos.xx[0] - ayanamsa + 360) % 360;

        let nakshatraExtent = 360.0 / 27.0; 
        let nakshatraIndex = Math.floor(moonSidereal / nakshatraExtent);
        let degreesPassed = moonSidereal % nakshatraExtent;
        let fractionRemaining = 1.0 - (degreesPassed / nakshatraExtent);

        const dashaLords = ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"];
        const dashaYears = [7, 20, 6, 10, 7, 18, 16, 19, 17];
        
        let startDashaIndex = nakshatraIndex % 9;
        let balanceYears = fractionRemaining * dashaYears[startDashaIndex];

        let birthDate = new Date(body.year, body.month - 1, body.day);
        let currentTimestamp = birthDate.getTime();
        let msPerYear = 365.25636 * 24 * 60 * 60 * 1000;

        let dashaList = [];
        let firstDashaEndMs = currentTimestamp + (balanceYears * msPerYear);
        dashaList.push({ lord: dashaLords[startDashaIndex], start_date: birthDate.toISOString().split('T')[0], end_date: new Date(firstDashaEndMs).toISOString().split('T')[0] });

        currentTimestamp = firstDashaEndMs;
        for (let i = 1; i < 9; i++) {
          let nextIndex = (startDashaIndex + i) % 9;
          let years = dashaYears[nextIndex];
          let endMs = currentTimestamp + (years * msPerYear);
          dashaList.push({ lord: dashaLords[nextIndex], start_date: new Date(currentTimestamp).toISOString().split('T')[0], end_date: new Date(endMs).toISOString().split('T')[0] });
          currentTimestamp = endMs;
        }

        res.status(200).json({ success: true, balance_dasha: { lord: dashaLords[startDashaIndex], years: balanceYears }, dashas: dashaList });
    } catch (e) {
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});

// ==========================================
// 7. 16 വർഗ്ഗ ചാർട്ടുകൾ
// ==========================================
app.post('/calculate-vargas', async (req, res) => {
    try {
        const body = req.body;
        let floatHour = body.hour + (body.min / 60.0) - 5.5;

        const eph = await load();
        const jd = eph.swe_julday(body.year, body.month, body.day, floatHour, Constants.SE_GREG_CAL);
        eph.swe_set_sid_mode(Constants.SE_SIDM_LAHIRI, 0, 0);
        const ayanamsa = eph.swe_get_ayanamsa_ut(jd);

        const getPos = (id) => {
           let p = eph.swe_calc_ut(jd, id, Constants.SEFLG_SWIEPH);
           return (p.xx[0] - ayanamsa + 360) % 360;
        };

        const planets = {
          Ascendant: (eph.swe_houses(jd, body.lat, body.lon, 'P'.charCodeAt(0)).ascendant - ayanamsa + 360) % 360,
          Sun: getPos(Constants.SE_SUN), Moon: getPos(Constants.SE_MOON), Mars: getPos(Constants.SE_MARS), 
          Mercury: getPos(Constants.SE_MERCURY), Jupiter: getPos(Constants.SE_JUPITER), Venus: getPos(Constants.SE_VENUS),
          Saturn: getPos(Constants.SE_SATURN), Rahu: getPos(Constants.SE_TRUE_NODE),
        };
        planets.Ketu = (planets.Rahu + 180) % 360;

        const getVargaSign = (deg, varga) => {
            const sign = Math.floor(deg / 30) + 1, degInSign = deg % 30;
            const isOdd = sign % 2 !== 0;
            const movableFixedDual = (sign % 3 === 1) ? 1 : (sign % 3 === 2) ? 2 : 3; 
            const element = (sign % 4 === 1) ? 1 : (sign % 4 === 2) ? 2 : (sign % 4 === 3) ? 3 : 4; 
            let part, start;
            switch(varga) {
                case 1: return sign; 
                case 2: return isOdd ? (degInSign < 15 ? 5 : 4) : (degInSign < 15 ? 4 : 5);
                case 3: part = Math.floor(degInSign / 10); return (sign - 1 + part * 4) % 12 + 1;
                case 4: part = Math.floor(degInSign / 7.5); return (sign - 1 + part * 3) % 12 + 1;
                case 7: part = Math.floor(degInSign / (30/7)); start = isOdd ? sign : (sign + 6); return (start - 1 + part) % 12 + 1;
                case 9: return (Math.floor(deg / (360 / 108)) % 12) + 1;
                case 10: part = Math.floor(degInSign / 3); start = isOdd ? sign : (sign + 8); return (start - 1 + part) % 12 + 1;
                case 12: part = Math.floor(degInSign / 2.5); return (sign - 1 + part) % 12 + 1;
                case 16: part = Math.floor(degInSign / (30/16)); start = (movableFixedDual === 1) ? 1 : (movableFixedDual === 2) ? 5 : 9; return (start - 1 + part) % 12 + 1;
                case 20: part = Math.floor(degInSign / 1.5); start = (movableFixedDual === 1) ? 1 : (movableFixedDual === 2) ? 9 : 5; return (start - 1 + part) % 12 + 1;
                case 24: part = Math.floor(degInSign / (30/24)); start = isOdd ? 5 : 4; return (start - 1 + part) % 12 + 1;
                case 27: part = Math.floor(degInSign / (30/27)); start = (element === 1) ? 1 : (element === 2) ? 4 : (element === 3) ? 7 : 10; return (start - 1 + part) % 12 + 1;
                case 30: 
                    let d = degInSign;
                    if (isOdd) { if (d <= 5) return 1; if (d <= 10) return 11; if (d <= 18) return 9; if (d <= 25) return 3; return 7; } 
                    else { if (d <= 5) return 2; if (d <= 12) return 6; if (d <= 20) return 12; if (d <= 25) return 10; return 8; }
                case 40: part = Math.floor(degInSign / (30/40)); start = isOdd ? 1 : 7; return (start - 1 + part) % 12 + 1;
                case 45: part = Math.floor(degInSign / (30/45)); start = (movableFixedDual === 1) ? 1 : (movableFixedDual === 2) ? 5 : 9; return (start - 1 + part) % 12 + 1;
                case 60: part = Math.floor(degInSign / 0.5); return (sign - 1 + part) % 12 + 1;
                default: return sign;
            }
        };

        const vargasList = [1, 2, 3, 4, 7, 9, 10, 12, 16, 20, 24, 27, 30, 40, 45, 60];
        let vargaData = {};
        vargasList.forEach(v => {
            vargaData[`D${v}`] = {};
            for (let [bodyName, degree] of Object.entries(planets)) { vargaData[`D${v}`][bodyName] = getVargaSign(degree, v); }
        });

        res.status(200).json({ success: true, vargas: vargaData });
    } catch (e) {
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});

// ==========================================
// 8. KP System & Ashtakavarga API
// ==========================================
app.post('/calculate-kp-ashtakavarga', async (req, res) => {
    try {
        const body = req.body;
        let floatHour = body.hour + (body.min / 60.0) - 5.5;

        const eph = await load();
        const jd = eph.swe_julday(body.year, body.month, body.day, floatHour, Constants.SE_GREG_CAL);
        eph.swe_set_sid_mode(Constants.SE_SIDM_LAHIRI, 0, 0); 
        const ayanamsa = eph.swe_get_ayanamsa_ut(jd);

        const getPos = (id) => {
           let p = eph.swe_calc_ut(jd, id, Constants.SEFLG_SWIEPH);
           return (p.xx[0] - ayanamsa + 360) % 360;
        };

        const planets = {
          Ascendant: (eph.swe_houses(jd, body.lat, body.lon, 'P'.charCodeAt(0)).ascendant - ayanamsa + 360) % 360,
          Sun: getPos(Constants.SE_SUN), Moon: getPos(Constants.SE_MOON), Mars: getPos(Constants.SE_MARS), 
          Mercury: getPos(Constants.SE_MERCURY), Jupiter: getPos(Constants.SE_JUPITER), Venus: getPos(Constants.SE_VENUS),
          Saturn: getPos(Constants.SE_SATURN), Rahu: getPos(Constants.SE_TRUE_NODE),
        };
        planets.Ketu = (planets.Rahu + 180) % 360;

        const signLords = ["Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter"];
        const dashaLords = ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"];
        const dashaYears = [7, 20, 6, 10, 7, 18, 16, 19, 17];
        
        let kpData = {};
        for (let [pName, deg] of Object.entries(planets)) {
            let signIndex = Math.floor(deg / 30);
            let sLord = signLords[signIndex];
            
            let nakshatraExtent = 360.0 / 27.0; 
            let nakshatraIndex = Math.floor(deg / nakshatraExtent);
            let stLordIndex = nakshatraIndex % 9;
            let stLord = dashaLords[stLordIndex];
            
            let degInNakshatra = deg % nakshatraExtent, passedDeg = 0.0, subLord = "";
            for (let i = 0; i < 9; i++) {
                let currentIndex = (stLordIndex + i) % 9;
                let subLordExtent = (dashaYears[currentIndex] / 120.0) * nakshatraExtent;
                if (degInNakshatra >= passedDeg && degInNakshatra < (passedDeg + subLordExtent)) { subLord = dashaLords[currentIndex]; break; }
                passedDeg += subLordExtent;
            }
            if (!subLord) subLord = dashaLords[(stLordIndex + 8) % 9];
            kpData[pName] = { degree: deg, rasi: signIndex + 1, sign_lord: sLord, star_lord: stLord, sub_lord: subLord };
        }

        const avRules = {
            Sun: { Sun:[1,2,4,7,8,9,10,11], Moon:[3,6,10,11], Mars:[1,2,4,7,8,9,10,11], Mercury:[3,5,6,9,10,11,12], Jupiter:[5,6,9,11], Venus:[6,7,12], Saturn:[1,2,4,7,8,9,10,11], Asc:[3,4,6,10,11,12] },
            Moon: { Sun:[3,6,7,8,10,11], Moon:[1,3,6,7,10,11], Mars:[2,3,5,6,9,10,11], Mercury:[1,3,4,5,7,8,10,11], Jupiter:[1,4,7,8,10,11,12], Venus:[3,4,5,7,9,10,11], Saturn:[3,5,6,11], Asc:[3,6,10,11] },
            Mars: { Sun:[3,5,6,10,11], Moon:[3,6,11], Mars:[1,2,4,7,8,10,11], Mercury:[3,5,6,11], Jupiter:[6,10,11,12], Venus:[6,8,11,12], Saturn:[1,4,7,8,9,10,11], Asc:[1,3,6,10,11] },
            Mercury: { Sun:[5,6,9,11,12], Moon:[2,4,6,8,10,11], Mars:[1,2,4,7,8,9,10,11], Mercury:[1,3,5,6,9,10,11,12], Jupiter:[6,8,11,12], Venus:[1,2,3,4,5,8,9,11], Saturn:[1,2,4,7,8,9,10,11], Asc:[1,2,4,6,8,10,11] },
            Jupiter: { Sun:[1,2,3,4,7,8,9,10,11], Moon:[2,5,7,9,11], Mars:[1,2,4,7,8,10,11], Mercury:[1,2,4,5,6,9,10,11], Jupiter:[1,2,3,4,7,8,10,11], Venus:[2,5,6,9,10,11], Saturn:[3,5,6,12], Asc:[1,2,4,5,6,9,10,11] },
            Venus: { Sun:[8,11,12], Moon:[1,2,3,4,5,8,9,11,12], Mars:[3,5,6,9,11,12], Mercury:[3,5,6,9,11], Jupiter:[5,8,9,10,11], Venus:[1,2,3,4,5,8,9,10,11], Saturn:[3,4,5,8,9,10,11], Asc:[1,2,3,4,5,8,9,11] },
            Saturn: { Sun:[1,2,4,7,8,10,11], Moon:[3,6,11], Mars:[3,5,6,10,11], Mercury:[6,8,9,10,11,12], Jupiter:[5,6,11,12], Venus:[6,11,12], Saturn:[3,5,6,11], Asc:[1,3,4,6,10,11] }
        };

        const getDistance = (start, end) => (end - start + 12) % 12 + 1;
        let savPoints = { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0, 8:0, 9:0, 10:0, 11:0, 12:0 };

        for (let targetSign = 1; targetSign <= 12; targetSign++) {
            for (let [planet, rules] of Object.entries(avRules)) {
                for (let [sourcePlanet, goodHouses] of Object.entries(rules)) {
                    let sourceSign = kpData[sourcePlanet].rasi;
                    let dist = getDistance(sourceSign, targetSign);
                    if (goodHouses.includes(dist)) { savPoints[targetSign]++; }
                }
            }
        }

        res.status(200).json({ success: true, kp_system: kpData, ashtakavarga: savPoints });
    } catch (e) {
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});

// ==========================================
// 9. Numerology API (Pythagorean System)
// ==========================================
app.post('/calculate-numerology', async (req, res) => {
    try {
        const body = req.body;
        const { name, dob } = body; 

        const reduceToSingleDigit = (num) => {
            while (num > 9 && num !== 11 && num !== 22 && num !== 33) {
                num = num.toString().split('').reduce((a, b) => parseInt(a) + parseInt(b), 0);
            }
            return num;
        };

        let dobString = dob.replace(/[^0-9]/g, '');
        let lifePathSum = dobString.split('').reduce((a, b) => parseInt(a) + parseInt(b), 0);
        let lifePath = reduceToSingleDigit(lifePathSum);

        const pythagoreanChart = {
            a:1, b:2, c:3, d:4, e:5, f:6, g:7, h:8, i:9, j:1, k:2, l:3, m:4, n:5, o:6, p:7, q:8, r:9,
            s:1, t:2, u:3, v:4, w:5, x:6, y:7, z:8
        };
        
        let nameSum = 0;
        let cleanName = name.toLowerCase().replace(/[^a-z]/g, '');
        for (let char of cleanName) { nameSum += pythagoreanChart[char] || 0; }
        let destinyNumber = reduceToSingleDigit(nameSum);

        const numerologyProperties = {
            1: { color: "Red", planet: "Sun", gem: "Ruby" }, 2: { color: "White", planet: "Moon", gem: "Pearl" },
            3: { color: "Yellow", planet: "Jupiter", gem: "Yellow Sapphire" }, 4: { color: "Brown", planet: "Rahu", gem: "Hessonite" },
            5: { color: "Green", planet: "Mercury", gem: "Emerald" }, 6: { color: "Pink/White", planet: "Venus", gem: "Diamond" },
            7: { color: "Grey", planet: "Ketu", gem: "Cat's Eye" }, 8: { color: "Black/Blue", planet: "Saturn", gem: "Blue Sapphire" },
            9: { color: "Red/Coral", planet: "Mars", gem: "Red Coral" }, 11: { color: "Silver", planet: "Uranus", gem: "Garnet" },
            22: { color: "Cream", planet: "Pluto", gem: "Rose Quartz" }, 33: { color: "Sky Blue", planet: "Neptune", gem: "Amethyst" }
        };

        let properties = numerologyProperties[lifePath] || numerologyProperties[1];

        res.status(200).json({ success: true, life_path_number: lifePath, destiny_number: destinyNumber, lucky_color: properties.color, ruling_planet: properties.planet, lucky_gem: properties.gem });
    } catch (e) {
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});

// ==========================================
// 10. Daily Horoscope, Gocharam & Nakshatra Details API
// ==========================================
app.post('/daily-horoscope', async (req, res) => {
    try {
        const body = req.body;
        const { year, month, day, hour, min, lat, lon } = body;
        
        const now = new Date();
        const currentYear = now.getUTCFullYear(), currentMonth = now.getUTCMonth() + 1;
        const currentDay = now.getUTCDate(), currentHour = now.getUTCHours() + (now.getUTCMinutes() / 60.0);

        const eph = await load();
        let floatHour = hour + (min / 60.0) - 5.5;
        const natalJd = eph.swe_julday(year, month, day, floatHour, Constants.SE_GREG_CAL);
        eph.swe_set_sid_mode(Constants.SE_SIDM_LAHIRI, 0, 0);
        const natalAyanamsa = eph.swe_get_ayanamsa_ut(natalJd);

        const getPos = (jd, id, ayanamsa) => {
            const pos = eph.swe_calc_ut(jd, id, Constants.SEFLG_SWIEPH);
            return (pos.xx[0] - ayanamsa + 360) % 360;
        };

        let natalMoonDeg = getPos(natalJd, Constants.SE_MOON, natalAyanamsa);
        let natalSunDeg = getPos(natalJd, Constants.SE_SUN, natalAyanamsa);
        let natalNakshatra = Math.floor(natalMoonDeg / (360/27)), natalRasi = Math.floor(natalMoonDeg / 30) + 1;
        let natalSunSign = Math.floor(natalSunDeg / 30) + 1; 

        const transitJd = eph.swe_julday(currentYear, currentMonth, currentDay, currentHour, Constants.SE_GREG_CAL);
        const transitAyanamsa = eph.swe_get_ayanamsa_ut(transitJd);
        let transitMoonDeg = getPos(transitJd, Constants.SE_MOON, transitAyanamsa);
        
        let transitNakshatra = Math.floor(transitMoonDeg / (360/27)), transitRasi = Math.floor(transitMoonDeg / 30) + 1;
        let tarabalam = ((transitNakshatra - natalNakshatra + 27) % 27) % 9 + 1;
        let chandrabalam = (transitRasi - natalRasi + 12) % 12 + 1;
        let isGoodDay = [2, 4, 6, 8, 9].includes(tarabalam) && [1, 3, 6, 7, 10, 11].includes(chandrabalam);

        const ganas = ["deva", "manushya", "rakshasa"], nadis = ["adi", "madhya", "antya"], elements = ["fire", "earth", "air", "water", "ether"];
        const animals = ["horse", "elephant", "sheep", "serpent", "serpent", "dog", "cat", "sheep", "cat", "rat", "rat", "cow", "buffalo", "tiger", "buffalo", "tiger", "deer", "deer", "dog", "monkey", "mongoose", "monkey", "lion", "horse", "lion", "cow", "elephant"];
        
        const nakshatraData = {
            nakshatra_index: natalNakshatra, rasi_index: natalRasi, sun_sign_index: natalSunSign,
            tree_key: `tree_${natalNakshatra + 1}`, bird_key: `bird_${(natalNakshatra % 5) + 1}`, 
            animal_key: `animal_${animals[natalNakshatra]}`, gana_key: `gana_${ganas[natalNakshatra % 3]}`,
            nadi_key: `nadi_${nadis[natalNakshatra % 3]}`, element_key: `element_${elements[natalNakshatra % 5]}`
        };

        res.status(200).json({ success: true, natal_info: nakshatraData, daily_transit: { transit_moon_rasi: transitRasi, transit_nakshatra: transitNakshatra, tarabalam_index: tarabalam, chandrabalam_index: chandrabalam, is_auspicious_day: isGoodDay } });
    } catch (e) {
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});

// ==========================================
// 11. Premium Local Notifications API
// ==========================================
app.post('/premium-alerts', async (req, res) => {
    try {
        const body = req.body;
        const { year, month, day, hour, min, lat, lon } = body;

        const eph = await load();
        let floatHour = hour + (min / 60.0) - 5.5;
        const natalJd = eph.swe_julday(year, month, day, floatHour, Constants.SE_GREG_CAL);
        eph.swe_set_sid_mode(Constants.SE_SIDM_LAHIRI, 0, 0);
        const natalAyanamsa = eph.swe_get_ayanamsa_ut(natalJd);
        let natalMoonDeg = (eph.swe_calc_ut(natalJd, Constants.SE_MOON, Constants.SEFLG_SWIEPH).xx[0] - natalAyanamsa + 360) % 360;
        let natalRasi = Math.floor(natalMoonDeg / 30) + 1;

        const tomorrow = new Date(); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        const tYear = tomorrow.getUTCFullYear(), tMonth = tomorrow.getUTCMonth() + 1, tDay = tomorrow.getUTCDate();

        const todayJd = eph.swe_julday(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, new Date().getUTCDate(), 12.0, Constants.SE_GREG_CAL);
        const tmrwJd = eph.swe_julday(tYear, tMonth, tDay, 12.0, Constants.SE_GREG_CAL);
        const tAyanamsa = eph.swe_get_ayanamsa_ut(tmrwJd);

        const checkTransit = (planetId, planetName) => {
            let degToday = (eph.swe_calc_ut(todayJd, planetId, Constants.SEFLG_SWIEPH).xx[0] - tAyanamsa + 360) % 360;
            let degTmrw = (eph.swe_calc_ut(tmrwJd, planetId, Constants.SEFLG_SWIEPH).xx[0] - tAyanamsa + 360) % 360;
            let signToday = Math.floor(degToday / 30) + 1, signTmrw = Math.floor(degTmrw / 30) + 1;
            
            if (signToday !== signTmrw) {
                let houseFromMoon = (signTmrw - natalRasi + 12) % 12 + 1;
                return { planet: planetName, new_sign: signTmrw, house: houseFromMoon, has_changed: true };
            }
            return { has_changed: false };
        };

        let transitAlerts = [];
        let planetsToCheck = [ { id: Constants.SE_JUPITER, name: "Jupiter" }, { id: Constants.SE_SATURN, name: "Saturn" }, { id: Constants.SE_MOON, name: "Moon" } ];
        for (let p of planetsToCheck) { let t = checkTransit(p.id, p.name); if (t.has_changed) transitAlerts.push(t); }

        let dayOfWeek = tomorrow.getUTCDay(); 
        const horaLords = [
            ["Sun", "Venus", "Mercury", "Moon", "Saturn", "Jupiter", "Mars"], ["Moon", "Saturn", "Jupiter", "Mars", "Sun", "Venus", "Mercury"],
            ["Mars", "Sun", "Venus", "Mercury", "Moon", "Saturn", "Jupiter"], ["Mercury", "Moon", "Saturn", "Jupiter", "Mars", "Sun", "Venus"],
            ["Jupiter", "Mars", "Sun", "Venus", "Mercury", "Moon", "Saturn"], ["Venus", "Mercury", "Moon", "Saturn", "Jupiter", "Mars", "Sun"],
            ["Saturn", "Jupiter", "Mars", "Sun", "Venus", "Mercury", "Moon"]
        ];

        let todaysHoras = horaLords[dayOfWeek], bestHoraIndex = -1;
        for (let i = 0; i < 7; i++) { if (todaysHoras[i] === "Jupiter" || todaysHoras[i] === "Venus") { bestHoraIndex = i; break; } }
        let goldenHourStart = 6 + bestHoraIndex; 
        
        res.status(200).json({ success: true, golden_hour: { start_hour: goldenHourStart, end_hour: goldenHourStart + 1, planet: todaysHoras[bestHoraIndex] }, transits: transitAlerts, target_date: `${tYear}-${tMonth}-${tDay}` });
    } catch (e) {
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});

// ==========================================
// 12. Advanced Pan-India Panchang & Festival API
// ==========================================
app.post('/monthly-calendar', async (req, res) => {
    try {
        const body = req.body;
        const { year, month, lat, lon } = body; 

        const eph = await load();
        const daysInMonth = new Date(year, month, 0).getDate();
        let calendarData = [];

        const solarMonths = ["Mesha (മേടം/Chithirai)", "Vrishabha (ഇടവം/Vaikasi)", "Mithuna (മിഥുനം/Aani)", "Karka (കർക്കടകം/Aadi)", "Simha (ചിങ്ങം/Aavani)", "Kanya (കന്നി/Purattasi)", "Tula (തുലാം/Aippasi)", "Vrischika (വൃശ്ചികം/Karthigai)", "Dhanu (ധനു/Margazhi)", "Makara (മകരം/Thai)", "Kumbha (കുംഭം/Maasi)", "Meena (മീനം/Panguni)"];
        const lunarMonths = ["Chaitra", "Vaisakha", "Jyeshtha", "Ashadha", "Sravana", "Bhadrapada", "Asvina", "Kartika", "Margasirsha", "Pausha", "Magha", "Phalguna"];

        const festivals = [
            { l_month: "Chaitra", paksha: "Shukla", tithi: 9, name: "ശ്രീരാമ നവമി (Ram Navami)" },
            { l_month: "Sravana", paksha: "Krishna", tithi: 8, name: "ശ്രീകൃഷ്ണ ജയന്തി (Janmashtami)" },
            { l_month: "Asvina", paksha: "Shukla", tithi: 10, name: "വിജയദശമി (Dussehra)" },
            { l_month: "Kartika", paksha: "Krishna", tithi: 15, name: "ദീപാവലി (Diwali)" }, 
            { l_month: "Phalguna", paksha: "Shukla", tithi: 15, name: "ഹോളി (Holi)" } 
        ];

        let currentSolarDay = 1; 

        for (let day = 1; day <= daysInMonth; day++) {
            let jd = eph.swe_julday(year, month, day, 12.0 - 5.5, Constants.SE_GREG_CAL);
            eph.swe_set_sid_mode(Constants.SE_SIDM_LAHIRI, 0, 0);
            let ayanamsa = eph.swe_get_ayanamsa_ut(jd);

            let sunDeg = (eph.swe_calc_ut(jd, Constants.SE_SUN, Constants.SEFLG_SWIEPH).xx[0] - ayanamsa + 360) % 360;
            let moonDeg = (eph.swe_calc_ut(jd, Constants.SE_MOON, Constants.SEFLG_SWIEPH).xx[0] - ayanamsa + 360) % 360;
            let sunDegPrev = (eph.swe_calc_ut(jd - 1, Constants.SE_SUN, Constants.SEFLG_SWIEPH).xx[0] - ayanamsa + 360) % 360;

            let sunRasi = Math.floor(sunDeg / 30), sunRasiPrev = Math.floor(sunDegPrev / 30);
            let isSankranti = false;
            if (sunRasi !== sunRasiPrev) { isSankranti = true; currentSolarDay = 1; } else { currentSolarDay++; }

            let diff = (moonDeg - sunDeg + 360) % 360;
            let tithiIndex = Math.floor(diff / 12) + 1;
            let paksha = tithiIndex <= 15 ? "Shukla" : "Krishna";
            let displayTithi = tithiIndex > 15 ? tithiIndex - 15 : tithiIndex; 

            let amantaMonthIdx = Math.floor((sunDeg + (diff > 0 ? 30 : 0)) / 30) % 12;
            let purnimantaMonthIdx = paksha === "Krishna" ? (amantaMonthIdx + 1) % 12 : amantaMonthIdx;
            let lMonthName = lunarMonths[amantaMonthIdx];

            let todayFestivals = [];
            if (isSankranti && sunRasi === 0) todayFestivals.push("വിഷു / Baisakhi");
            if (isSankranti && sunRasi === 9) todayFestivals.push("മകര സംക്രമം / Pongal");
            
            let matchedFestival = festivals.find(f => f.l_month === lMonthName && f.paksha === paksha && f.tithi === displayTithi);
            if (matchedFestival) todayFestivals.push(matchedFestival.name);

            calendarData.push({
                gregorian_date: `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`, day: day,
                solar_date: { month: solarMonths[sunRasi], day: currentSolarDay, is_sankranti: isSankranti },
                lunar_amanta: { month: lunarMonths[amantaMonthIdx], paksha: paksha, tithi: displayTithi },
                lunar_purnimanta: { month: lunarMonths[purnimantaMonthIdx], paksha: paksha, tithi: displayTithi },
                festivals: todayFestivals, is_important: todayFestivals.length > 0 || isSankranti
            });
        }
        res.status(200).json({ success: true, month: month, year: year, calendar: calendarData });
    } catch (e) {
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running smoothly on port ${PORT}`);
});
