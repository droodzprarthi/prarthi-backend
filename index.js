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
          
          // 🌟 പുതിയതായി ചേർത്തത്: Speed നെഗറ്റീവ് ആണെങ്കിൽ അത് വക്രഗതിയാണ് (Retrograde) 🌟
          let isRetrograde = pos.xx[3] < 0; 
          
          positions[p.name] = { 
              degree: siderealDeg, 
              is_retrograde: isRetrograde // ആപ്പിലേക്ക് അയക്കുന്നു
          };
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

        const getHouseDiff = (start, target) => (target - start + 12) % 12 + 1;

        const ganas = [1, 2, 3, 2, 3, 1, 1, 1, 3, 3, 2, 2, 2, 3, 1, 2, 2, 3, 3, 2, 2, 1, 3, 3, 2, 2, 1]; 
        const nadis = [1, 2, 3, 3, 2, 1, 1, 2, 3, 3, 2, 1, 1, 2, 3, 3, 2, 1, 1, 2, 3, 3, 2, 1, 1, 2, 3]; 
        const yonis = [1, 2, 3, 4, 4, 5, 6, 3, 6, 7, 7, 8, 9, 10, 9, 10, 11, 11, 5, 12, 13, 12, 14, 1, 14, 8, 2]; 
        const hostileYonis = { 1:9, 9:1, 2:14, 14:2, 3:12, 12:3, 4:13, 13:4, 5:11, 11:5, 6:7, 7:6, 8:10, 10:8 }; 
        const rajjus = [1, 2, 3, 4, 5, 5, 4, 3, 2, 1, 1, 2, 3, 4, 5, 5, 4, 3, 2, 1, 1, 2, 3, 4, 5, 5, 4]; 
        const vrukshas = ["Nuxvomica", "Emblic Myrobalan", "Cluster Fig", "Rose Apple", "Cutch Tree", "Ebony", "Bamboo", "Peepal", "Mesua", "Banyan", "Flame of the Forest", "Fig", "Jasmine", "Pine", "Coral Tree", "Wood Apple", "Bullet Wood", "Pine", "Sal Tree", "Cane", "Jackfruit", "Crown Flower", "Vanni", "Kadamba", "Neem", "Mango", "Madhuca"];
        const pakshis = ["Falcon", "Owl", "Crow", "Cock", "Peacock"]; 

        const getFullAstroDetails = (person) => {
            let floatHour = person.hour + (person.min / 60.0) - 5.5; 
            const jd = eph.swe_julday(person.year, person.month, person.day, floatHour, Constants.SE_GREG_CAL);
            const ayanamsa = eph.swe_get_ayanamsa_ut(jd);
            
            const getPos = (id) => (eph.swe_calc_ut(jd, id, Constants.SEFLG_SWIEPH).xx[0] - ayanamsa + 360) % 360;

            let ascendant = (eph.swe_houses(jd, person.lat, person.lon, 'P'.charCodeAt(0)).ascendant - ayanamsa + 360) % 360;
            let moonDeg = getPos(Constants.SE_MOON);
            
            let planets = {
                Ascendant: Math.floor(ascendant / 30) + 1,
                Moon: Math.floor(moonDeg / 30) + 1, Venus: Math.floor(getPos(Constants.SE_VENUS) / 30) + 1,
                Sun: Math.floor(getPos(Constants.SE_SUN) / 30) + 1, Mars: Math.floor(getPos(Constants.SE_MARS) / 30) + 1,
                Saturn: Math.floor(getPos(Constants.SE_SATURN) / 30) + 1, Rahu: Math.floor(getPos(Constants.SE_TRUE_NODE) / 30) + 1
            };
            planets.Ketu = (planets.Rahu + 6 - 1) % 12 + 1;

            let nakshatraIndex = Math.floor(moonDeg / (360 / 27));
            let pada = Math.floor((moonDeg % (360 / 27)) / (360 / 108)) + 1;
            
            let papaPoints = 0;
            const papaHouses = [1, 2, 4, 7, 8, 12];
            const basePoints = { 8: 3, 7: 2, 1: 1, 2: 1, 4: 1, 12: 1 };
            const maleficPlanets = ["Mars", "Sun", "Saturn", "Rahu", "Ketu"];
            const referencePoints = ["Ascendant", "Moon", "Venus"]; 

            referencePoints.forEach(ref => {
                maleficPlanets.forEach(malefic => {
                    let diff = getHouseDiff(planets[ref], planets[malefic]);
                    if (papaHouses.includes(diff)) {
                        let multiplier = (malefic === "Mars") ? 1.0 : 0.75; 
                        papaPoints += (basePoints[diff] * multiplier);
                    }
                });
            });

            let degreesPassed = moonDeg % (360 / 27);
            let fractionRemaining = 1.0 - (degreesPassed / (360 / 27));
            const dashaYears = [7, 20, 6, 10, 7, 18, 16, 19, 17];
            let startDashaIndex = nakshatraIndex % 9;
            let balanceYears = fractionRemaining * dashaYears[startDashaIndex];
            
            let marsFromAsc = getHouseDiff(planets.Ascendant, planets.Mars);
            let isManglik = [1, 2, 4, 7, 8, 12].includes(marsFromAsc);
            let hasSarpaDosham = [1, 2, 7, 8].includes(getHouseDiff(planets.Ascendant, planets.Rahu));

            return { 
                nakshatra_index: nakshatraIndex, pada: pada, rasi_index: planets.Moon,
                papa_points: papaPoints, is_manglik: isManglik, has_sarpa_dosham: hasSarpaDosham,
                balance_dasha_years: balanceYears, start_dasha_index: startDashaIndex,
                attributes: { gana: ganas[nakshatraIndex], nadi: nadis[nakshatraIndex], yoni: yonis[nakshatraIndex], rajju: rajjus[nakshatraIndex], vruksha: vrukshas[nakshatraIndex], pakshi: pakshis[nakshatraIndex % 5] }
            };
        };

        let boy = getFullAstroDetails(body.boy);
        let girl = getFullAstroDetails(body.girl);

        let nakshatraDistance = (boy.nakshatra_index - girl.nakshatra_index + 27) % 27 + 1;
        let rasiDistance = (boy.rasi_index - girl.rasi_index + 12) % 12 + 1;

        let dinam = [2, 4, 6, 8, 9, 11, 13, 15, 18, 20, 24, 26].includes(nakshatraDistance) ? "Good" : "Bad";
        let ganam = (boy.attributes.gana === girl.attributes.gana) ? "Good" : ((girl.attributes.gana === 1 && boy.attributes.gana === 2) ? "Average" : "Bad");
        let yoni = (hostileYonis[boy.attributes.yoni] === girl.attributes.yoni) ? "Bad" : "Good";
        let rasi = [1, 3, 4, 5, 7, 9, 10, 11].includes(rasiDistance) ? "Good" : "Bad";
        let rajju = (boy.attributes.rajju !== girl.attributes.rajju) ? "Good" : "Bad";
        let nadi = (boy.attributes.nadi !== girl.attributes.nadi) ? "Good" : "Bad";
        let streeDheergham = (nakshatraDistance > 15) ? "Good" : ((nakshatraDistance > 7) ? "Average" : "Bad");
        let mahendram = [4, 7, 10, 13, 16, 19, 22, 25].includes(nakshatraDistance) ? "Good" : "Bad";
        let vruksham = (boy.attributes.vruksha === girl.attributes.vruksha) ? "Good" : "Average";
        let pakshi = (boy.attributes.pakshi === girl.attributes.pakshi) ? "Good" : "Average";

        let tenPoruthamScore = [dinam, ganam, yoni, rasi, rajju, streeDheergham, mahendram].filter(p => p === "Good").length;

        let ashtakoota = {
            varna: (girl.rasi_index <= boy.rasi_index) ? 1 : 0,
            vasya: 2, 
            tara: (nakshatraDistance % 9 !== 3 && nakshatraDistance % 9 !== 5 && nakshatraDistance % 9 !== 7) ? 3 : 1.5,
            yoni: (yoni === "Good") ? 4 : 1,
            grahaMaitri: 5, 
            gana: (ganam === "Good") ? 6 : (ganam === "Average" ? 3 : 0),
            bhakoota: (rasi === "Good") ? 7 : 0,
            nadi: (nadi === "Good") ? 8 : 0
        };
        let totalAshtakoota = Object.values(ashtakoota).reduce((a, b) => a + b, 0);

        let dasaSandhiDifference = Math.abs(boy.balance_dasha_years - girl.balance_dasha_years);
        let hasDasaSandhi = dasaSandhiDifference < 1.0; 

        let papasamyamMatch = "Average";
        let papaDiff = boy.papa_points - girl.papa_points;
        if (papaDiff > 0 && papaDiff <= 15) papasamyamMatch = "Good"; 
        else if (Math.abs(papaDiff) < 5) papasamyamMatch = "Good";
        else papasamyamMatch = "Bad"; 

        let manglikMatch = (boy.is_manglik === girl.is_manglik);
        let sarpaDoshaMatch = (boy.has_sarpa_dosham === girl.has_sarpa_dosham);

        res.status(200).json({ 
            success: true, 
            kerala_10_porutham: { 
                score: `${tenPoruthamScore}/10`, 
                dinam, ganam, yoni, rasi, rajju, mahendram, stree_dheergham: streeDheergham,
                overall_status: tenPoruthamScore >= 6 ? "Recommended" : "Not Recommended"
            },
            tamil_20_porutham_extended: {
                nadi_porutham: nadi, 
                vruksha_porutham: vruksham,
                pakshi_porutham: pakshi
            },
            ashtakoota_36_points: { 
                total_score: totalAshtakoota, 
                minimum_required: 18,
                breakdown: ashtakoota,
                status: totalAshtakoota >= 18 ? "Match" : "No Match"
            },
            papasamyam: { 
                boy_total_points: boy.papa_points.toFixed(2), 
                girl_total_points: girl.papa_points.toFixed(2), 
                match_status: papasamyamMatch 
            },
            dosha_samyam: { 
                manglik_match: manglikMatch, 
                sarpa_dosha_match: sarpaDoshaMatch 
            },
            dasa_sandhi: { 
                has_dasa_sandhi: hasDasaSandhi, 
                warning: hasDasaSandhi ? "വിവാഹ സമയത്ത് ഇരുവർക്കും ഒരേസമയം ദശാമാറ്റം വരുന്നതിനാൽ ദശാസന്ധി ദോഷമുണ്ട്." : "ദശാസന്ധി ദോഷമില്ല."
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});

// ==========================================
// 4. സമ്പൂർണ്ണ ദോഷ നിർണ്ണയം
// ==========================================
// ==========================================
// 4. സമ്പൂർണ്ണ ദോഷ നിർണ്ണയം (Manglik Dosha Fixed)
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
        
        // 🌟 ഫിക്സ് 5: ചൊവ്വാദോഷത്തിന് പ്രധാനപ്പെട്ട Exception നൽകി (സ്വക്ഷേത്രം & ഉച്ചം) 🌟
        let isMarsStrong = [1, 8, 10].includes(marsRasi); // 1-മേടം, 8-വൃശ്ചികം, 10-മകരം
        let isManglikAsc = manglikHouses.includes(marsFromAsc);
        let isManglikMoon = manglikHouses.includes(marsFromMoon);
        let hasManglikDosha = (isManglikAsc || isManglikMoon) && !isMarsStrong;

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


// ==========================================
// 13. SHASTRA OMENS (ഗൗളി, സ്വപ്നം, ശകുനം, തുമ്മൽ, കാക്ക)
// ==========================================
app.get('/get-shastra-omens', (req, res) => {
    try {
        const lang = req.query.lang || "ml";
        
        // Comprehensive Dictionary of Omens in Malayalam & English
        const omensData = {
            "gowli_shastra": {
                "category_ml": "ഗൗളീശാസ്ത്രം (പല്ലി വീഴുന്ന ഫലം)",
                "category_en": "Lizard Astrology (Gowli Shastra)",
                "rules": [
                    { "condition_ml": "പുരുഷന്റെ വലതു ഭാഗത്ത് വീണാൽ", "condition_en": "Falls on Man's Right Side", "result_ml": "ശുഭഫലം (Good Luck)", "result_en": "Auspicious (Good Luck)" },
                    { "condition_ml": "പുരുഷന്റെ ഇടതു ഭാഗത്ത് വീണാൽ", "condition_en": "Falls on Man's Left Side", "result_ml": "അശുഭഫലം (Bad Luck)", "result_en": "Inauspicious (Bad Luck)" },
                    { "condition_ml": "സ്ത്രീയുടെ ഇടതു ഭാഗത്ത് വീണാൽ", "condition_en": "Falls on Woman's Left Side", "result_ml": "ശുഭഫലം (Good Luck)", "result_en": "Auspicious (Good Luck)" },
                    { "condition_ml": "സ്ത്രീയുടെ വലതു ഭാഗത്ത് വീണാൽ", "condition_en": "Falls on Woman's Right Side", "result_ml": "അശുഭഫലം (Bad Luck)", "result_en": "Inauspicious (Bad Luck)" },
                    { "condition_ml": "തലയിൽ വീണാൽ (രണ്ടുപേർക്കും)", "condition_en": "Falls on Head", "result_ml": "കടുത്ത ദുഃഖം, കലഹം", "result_en": "Sorrow, Disputes" },
                    { "condition_ml": "നെറ്റിയിൽ വീണാൽ", "condition_en": "Falls on Forehead", "result_ml": "സ്ഥാനമാനങ്ങൾ ലഭിക്കും", "result_en": "Honor & Promotions" },
                    { "condition_ml": "പാദത്തിൽ വീണാൽ", "condition_en": "Falls on Feet", "result_ml": "യാത്രാക്ലേശം, യാത്രകൾ വേണ്ടിവരും", "result_en": "Travel, Tiredness" }
                ],
                "regional_info_ml": "കേരളത്തിൽ ഗാർഗ്യ സ്മൃതി പ്രകാരം പല്ലി ശരീരത്തിൽ വീഴുന്നതിനാണ് പ്രാധാന്യം. എന്നാൽ തമിഴ്‌നാട്ടിലും ആന്ധ്രയിലും പല്ലി ചിലയ്ക്കുന്ന (ശബ്ദമുണ്ടാക്കുന്ന) ദിശയും ദിവസവും നോക്കുന്ന 'ഗൗളി പഞ്ചാംഗം' രീതിയാണ് കൂടുതൽ പ്രചാരത്തിലുള്ളത്.",
                "regional_info_en": "In Kerala, Gowli falling on the body is significant. In Tamil Nadu & Andhra, the direction and day of the Lizard's chirping are deeply analyzed (Gowli Panchangam)."
            },
            "swapna_shastra": {
                "category_ml": "സ്വപ്ന ശാസ്ത്രം",
                "category_en": "Dream Interpretations",
                "rules": [
                    { "condition_ml": "ആനയെ സ്വപ്നം കണ്ടാൽ", "condition_en": "Seeing an Elephant", "result_ml": "സമ്പത്ത്, ഐശ്വര്യം (കേരളത്തിൽ പൂർവ്വികരുടെ സാന്നിധ്യമായും കാണുന്നു)", "result_en": "Wealth & Prosperity (Ancestral presence in Kerala)" },
                    { "condition_ml": "പാമ്പ് കടിക്കുന്നതായി കണ്ടാൽ", "condition_en": "Snake Biting", "result_ml": "ശത്രുനാശം, ധനലാഭം", "result_en": "Victory over enemies, Financial gain" },
                    { "condition_ml": "പല്ല് കൊഴിയുന്നതായി കണ്ടാൽ", "condition_en": "Falling Teeth", "result_ml": "കുടുംബത്തിൽ രോഗം അല്ലെങ്കിൽ ദുഃഖം", "result_en": "Sickness or sorrow in the family" },
                    { "condition_ml": "മരണമോ ശവമോ കണ്ടാൽ", "condition_en": "Seeing Death or Corpse", "result_ml": "ആയുർദൈർഘ്യം വർദ്ധിക്കും, രോഗമുക്തി", "result_en": "Long life, Recovery from illness" },
                    { "condition_ml": "തീപിടുത്തം കണ്ടാൽ", "condition_en": "Seeing Fire", "result_ml": "സ്ഥാനക്കയറ്റം, പുതിയ ഉത്തരവാദിത്തങ്ങൾ", "result_en": "Promotions, New responsibilities" }
                ],
                "regional_info_ml": "സ്വപ്നം കാണുന്ന യാമം (സമയം) അനുസരിച്ച് ഫലസിദ്ധി വ്യത്യാസപ്പെടും. രാത്രി ആദ്യ യാമത്തിൽ കണ്ടാൽ 1 വർഷം കൊണ്ടും, പുലർച്ചെ (ബ്രാഹ്മമുഹൂർത്തത്തിൽ) കണ്ടാൽ അന്ന് തന്നെയോ ആഴ്ചകൾക്കുള്ളിലോ ഫലിക്കും.",
                "regional_info_en": "Dreams seen in the early night take a year to manifest, while dreams seen in the early morning (Brahma Muhurta) manifest immediately."
            },
            "shakunam": {
                "category_ml": "യാത്രാ ശകുനങ്ങൾ (നിമിത്തങ്ങൾ)",
                "category_en": "Travel Omens & Signs",
                "rules": [
                    { "condition_ml": "മംഗല്യവതി, നിറകുടം, പശു എന്നിവയെ കാണുന്നത്", "condition_en": "Seeing Married Woman, Full Pot, Cow", "result_ml": "ഉത്തമ ശകുനം (കാര്യവിജയം)", "result_en": "Highly Auspicious (Success)" },
                    { "condition_ml": "പൂച്ച കുറുകെ ചാടുന്നത്", "condition_en": "Cat crossing the path", "result_ml": "അശുഭം (യാത്ര അല്പനേരം മാറ്റിവെക്കുക)", "result_en": "Inauspicious (Delay the trip)" },
                    { "condition_ml": "വിറക്, ഒഴിഞ്ഞ പാത്രം എന്നിവ കാണുന്നത്", "condition_en": "Seeing Firewood, Empty Pot", "result_ml": "തടസ്സങ്ങൾ", "result_en": "Obstacles" },
                    { "condition_ml": "ഇരട്ട ബ്രാഹ്മണരെ കാണുന്നത്", "condition_en": "Seeing Twin Brahmins", "result_ml": "അത്യുത്തമം", "result_en": "Highly Auspicious" }
                ],
                "regional_info_ml": "ഉത്തരേന്ത്യൻ ശകുന ശാസ്ത്രത്തിൽ മൃഗങ്ങളുടെ നീക്കങ്ങൾക്കും (ഉദാഹരണത്തിന് യാത്ര പോകുമ്പോൾ പട്ടി ഇടത്തുനിന്നും വലത്തോട്ട് പോയാൽ ശുഭം) പ്രാധാന്യമുണ്ട്.",
                "regional_info_en": "North Indian Shakun Shastra places high importance on the movement direction of animals crossing your path."
            },
            "anga_samudrika": {
                "category_ml": "അംഗ സാമുദ്രികം (ശരീരം തുടിക്കുന്ന ഫലം)",
                "category_en": "Anga Samudrika (Body Twitching)",
                "rules": [
                    { "condition_ml": "പുരുഷന്റെ വലതുകണ്ണ് തുടിച്ചാൽ", "condition_en": "Man's Right Eye Twitches", "result_ml": "ശുഭവാർത്ത, ഇഷ്ടജന സമാഗമം", "result_en": "Good news, Meeting loved ones" },
                    { "condition_ml": "സ്ത്രീയുടെ ഇടതുകണ്ണ് തുടിച്ചാൽ", "condition_en": "Woman's Left Eye Twitches", "result_ml": "ശുഭവാർത്ത, സന്തോഷം", "result_en": "Good news, Happiness" },
                    { "condition_ml": "വലത്തെ ഉള്ളംകൈ തരിച്ചാൽ", "condition_en": "Right Palm Itching", "result_ml": "ധനലാഭം", "result_en": "Financial Gain" },
                    { "condition_ml": "ഇടത്തെ ഉള്ളംകൈ തരിച്ചാൽ", "condition_en": "Left Palm Itching", "result_ml": "ധനനഷ്ടം (സ്ത്രീകൾക്ക് ധനലാഭം)", "result_en": "Financial Loss (Gain for Women)" }
                ],
                "regional_info_ml": "മിക്കയിടത്തും വലതുഭാഗം പുരുഷന്മാർക്കും ഇടതുഭാഗം സ്ത്രീകൾക്കും ഭാഗ്യമായി കണക്കാക്കുന്നു.",
                "regional_info_en": "Generally, right side twitching is lucky for men, and left side is lucky for women."
            },
            "kaka_thummal": {
                "category_ml": "കാക്ക ശാസ്ത്രം & തുമ്മൽ ശാസ്ത്രം",
                "category_en": "Crow Omens & Sneezing Omens",
                "rules": [
                    { "condition_ml": "യാത്ര പുറപ്പെടുമ്പോൾ ഒറ്റത്തവണ തുമ്മിയാൽ", "condition_en": "One Sneeze when leaving", "result_ml": "യാത്രാ തടസ്സം", "result_en": "Obstacle in travel" },
                    { "condition_ml": "രണ്ടു തവണ തുടർച്ചയായി തുമ്മിയാൽ", "condition_en": "Two consecutive sneezes", "result_ml": "കാര്യവിജയം, ശുഭം", "result_en": "Success, Auspicious" },
                    { "condition_ml": "വീടിനു മുന്നിൽ കാക്ക കരഞ്ഞാൽ", "condition_en": "Crow cawing in front of house", "result_ml": "അതിഥികൾ വരും", "result_en": "Guests will arrive" },
                    { "condition_ml": "യാത്രയിൽ കാക്ക വലത്തുനിന്നും ഇടത്തോട്ട് പറന്നാൽ", "condition_en": "Crow flies Right to Left during travel", "result_ml": "ലാഭം, വിജയം", "result_en": "Profit, Victory" }
                ],
                "regional_info_ml": "തമിഴ്‌നാട്ടിൽ കാക്ക കരയുന്ന ദിശ നോക്കി ശകുനം പറയുന്ന 'കാക്ക ശാസ്ത്രം' വളരെ പ്രശസ്തമാണ്.",
                "regional_info_en": "In Tamil Nadu, 'Kaka Shastra' (analyzing crow sounds and directions) is a highly respected tradition."
            }
        };

        // ഭാഷയ്ക്ക് അനുസരിച്ച് ഡാറ്റ ഫിൽറ്റർ ചെയ്യുന്നു
        const formattedData = Object.keys(omensData).map(key => {
            const shastra = omensData[key];
            return {
                id: key,
                category: lang === 'en' ? shastra.category_en : shastra.category_ml,
                regional_info: lang === 'en' ? shastra.regional_info_en : shastra.regional_info_ml,
                rules: shastra.rules.map(r => ({
                    condition: lang === 'en' ? r.condition_en : r.condition_ml,
                    result: lang === 'en' ? r.result_en : r.result_ml
                }))
            };
        });

        res.status(200).json({ success: true, shastras: formattedData });
    } catch (e) {
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});

// ==========================================
// 14. പാൻ-ഇന്ത്യൻ ബലിയിടേണ്ട തീയതി (Next Shraddha / Bali Date)
// ==========================================
app.post('/calculate-next-bali', async (req, res) => {
    try {
        const body = req.body;
        // 'solar' (Kerala/TN) അല്ലെങ്കിൽ 'lunar' (North India/Karnataka)
        const method = body.calculation_method || 'solar'; 
        
        const eph = await load();
        eph.swe_set_sid_mode(Constants.SE_SIDM_LAHIRI, 0, 0);

        // 1. മരണ സമയത്തെ വിവരങ്ങൾ (12:00 PM IST സമയമെടുക്കുന്നു)
        const dJd = eph.swe_julday(body.death_year, body.death_month, body.death_day, 6.5, Constants.SE_GREG_CAL);
        const dAyanamsa = eph.swe_get_ayanamsa_ut(dJd);
        const dSun = (eph.swe_calc_ut(dJd, Constants.SE_SUN, Constants.SEFLG_SWIEPH).xx[0] - dAyanamsa + 360) % 360;
        const dMoon = (eph.swe_calc_ut(dJd, Constants.SE_MOON, Constants.SEFLG_SWIEPH).xx[0] - dAyanamsa + 360) % 360;

        const dDiff = (dMoon - dSun + 360) % 360;
        const targetTithi = Math.floor(dDiff / 12);
        const targetSunRasi = Math.floor(dSun / 30); // സൗരമാന മാസം

        // ചന്ദ്രമാസം (Lunar Month) കണ്ടുപിടിക്കാനുള്ള ഫംഗ്ഷൻ (അമാവാസി അടിസ്ഥാനമാക്കി)
        const getLunarMonth = (jd, tithiIndex) => {
            let approxAmavasyaJd = jd - (tithiIndex * 0.9843);
            let aAyanamsa = eph.swe_get_ayanamsa_ut(approxAmavasyaJd);
            let aSun = (eph.swe_calc_ut(approxAmavasyaJd, Constants.SE_SUN, Constants.SEFLG_SWIEPH).xx[0] - aAyanamsa + 360) % 360;
            return Math.floor(aSun / 30);
        };

        const targetLunarMonth = getLunarMonth(dJd, targetTithi); // ചന്ദ്രമാന മാസം

        // 2. ഇന്നത്തെ ദിവസത്തിന് ശേഷം വരുന്ന അടുത്ത ബലി തീയതി കണ്ടുപിടിക്കുന്നു
        const today = new Date();
        let currentYear = today.getFullYear();
        let foundDate = null;

        for (let year = currentYear; year <= currentYear + 1; year++) {
            let startMonth = body.death_month - 2; 
            if(startMonth < 1) startMonth = 1;
            let startDate = new Date(year, startMonth - 1, 1);
            
            // ഏകദേശം 120 ദിവസത്തെ ലൂപ്പ്
            for (let i = 0; i < 120; i++) { 
                let checkDate = new Date(startDate.getTime() + (i * 86400000));
                
                if (checkDate < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
                    continue;
                }

                let cJd = eph.swe_julday(checkDate.getFullYear(), checkDate.getMonth() + 1, checkDate.getDate(), 6.5, Constants.SE_GREG_CAL);
                let cAyanamsa = eph.swe_get_ayanamsa_ut(cJd);
                let cSun = (eph.swe_calc_ut(cJd, Constants.SE_SUN, Constants.SEFLG_SWIEPH).xx[0] - cAyanamsa + 360) % 360;
                let cMoon = (eph.swe_calc_ut(cJd, Constants.SE_MOON, Constants.SEFLG_SWIEPH).xx[0] - cAyanamsa + 360) % 360;

                let cDiff = (cMoon - cSun + 360) % 360;
                let cTithi = Math.floor(cDiff / 12);

                if (method === 'solar') {
                    // കേരളം/തമിഴ്നാട് രീതി (സൂര്യ രാശി + തിഥി)
                    let cSunRasi = Math.floor(cSun / 30);
                    if (cSunRasi === targetSunRasi && cTithi === targetTithi) {
                        foundDate = checkDate;
                        break;
                    }
                } else {
                    // ഉത്തരേന്ത്യൻ രീതി (ചന്ദ്രമാസം + തിഥി)
                    let cLunarMonth = getLunarMonth(cJd, cTithi);
                    if (cLunarMonth === targetLunarMonth && cTithi === targetTithi) {
                        foundDate = checkDate;
                        break;
                    }
                }
            }
            if (foundDate) break;
        }

        res.status(200).json({
            success: true,
            target_tithi_index: targetTithi,
            calculation_method: method,
            next_bali_date: foundDate ? foundDate.toISOString().split('T')[0] : null
        });
    } catch (e) {
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running smoothly on port ${PORT}`);
});
