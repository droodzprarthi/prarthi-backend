            22: { color: "Cream", planet: "Pluto", gem: "Rose Quartz" }, 33: { color: "Sky Blue", planet: "Neptune", gem: "Amethyst" }
        };

        let properties = numerologyProperties[lifePath] || numerologyProperties[1];

        res.status(200).json({ success: true, life_path_number: lifePath, destiny_number: destinyNumber, lucky_color: properties.color, ruling_planet: properties.planet, lucky_gem: properties.gem });
    } catch (e) {
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});
    
// ==========================================
// 11. Daily Horoscope, Gocharam & Nakshatra Details API
// ==========================================
app.post('/daily-horoscope', async (req, res) => {
    try {
        const body = req.body;
        const { year, month, day, hour, min, lat, lon } = body;
        
        const now = new Date();
        const currentYear = now.getUTCFullYear(), currentMonth = now.getUTCMonth() + 1;
        const currentDay = now.getUTCDate(), currentHour = now.getUTCHours() + (now.getUTCMinutes() / 60.0);

        const { eph, Constants } = await getEph();
        let floatHour = hour + (min / 60.0) - 5.5;
        const natalJd = eph.swe_julday(year, month, day, floatHour, Constants.SE_GREG_CAL);
        eph.swe_set_sid_mode(Constants.SE_SIDM_LAHIRI, 0, 0);
        const natalAyanamsa = eph.swe_get_ayanamsa_ut(natalJd);

        const getPos = (jd, id, ayanamsa) => (eph.swe_calc_ut(jd, id, Constants.SEFLG_SWIEPH).xx[0] - ayanamsa + 360) % 360;

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
// 12. Premium Local Notifications API
// ==========================================
app.post('/premium-alerts', async (req, res) => {
    try {
        const body = req.body;
        const { year, month, day, hour, min, lat, lon } = body;

        const { eph, Constants } = await getEph();
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
// 13. Advanced Pan-India Panchang & Festival API
// ==========================================
app.post('/monthly-calendar', async (req, res) => {
    try {
        const body = req.body;
        const { year, month, lat, lon } = body; 

        const { eph, Constants } = await getEph();
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

// പോർട്ട് കോൺഫിഗറേഷൻ (Render തനിയെ പോർട്ട് എടുക്കും)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running smoothly on port ${PORT}`);
});
