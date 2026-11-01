/* ========= FitMeal · Main App Logic ========= */

const App = (() => {

  // ============== 存储层 ==============
  const DB_KEY = "fitmeal_db_v3";

  function loadDB() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (!data.records) data.records = [];
        if (!data.settings) data.settings = {};
        return data;
      }
    } catch(e) {}
    return { profile: null, plan: null, logs: {}, settings: {}, records: [] };
  }

  function saveDB(db) {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  }

  let db = loadDB();

  // ============== 规则引擎 ==============
  // Mifflin-St Jeor BMR
  function calcBMR(p) {
    const base = 10 * p.weight + 6.25 * p.height - 5 * p.age;
    return p.gender === "male" ? base + 5 : base - 161;
  }

  function calcTDEE(p) {
    return Math.round(calcBMR(p) * parseFloat(p.activity));
  }

  function calcTargetKcal(p) {
    const tdee = calcTDEE(p);
    if (p.goal === "fatloss") return tdee - 400;
    if (p.goal === "muscle") return tdee + 250;
    return tdee; // tone
  }

  function calcMacro(targetKcal, goal) {
    let pct = { carbs: 0.38, protein: 0.30, fat: 0.32 }; // fatloss
    if (goal === "muscle") pct = { carbs: 0.45, protein: 0.28, fat: 0.27 };
    if (goal === "tone")   pct = { carbs: 0.42, protein: 0.30, fat: 0.28 };
    return {
      carbs: Math.round(targetKcal * pct.carbs / 4),
      protein: Math.round(targetKcal * pct.protein / 4),
      fat: Math.round(targetKcal * pct.fat / 9),
    };
  }

  function getTrainingFrequency(p) {
    if (p.experience === "beginner") {
      if (p.goal === "fatloss") return { days: 3, split: "full-body", minutes: 35 };
      return { days: 4, split: "push-pull-legs", minutes: 50 };
    }
    // intermediate
    if (p.goal === "muscle") return { days: 6, split: "ppl-advanced", minutes: 65 };
    return { days: 5, split: "upper-lower", minutes: 55 };
  }

  // ============== 计划生成器 ==============

  // 动作选择器（按部位随机，返回指定数量）
  function pickExercises(muscleGroups, count) {
    const result = [];
    const used = new Set();
    const pool = muscleGroups.flatMap(g => EXERCISE_LIBRARY[g] || []);
    for (let i = 0; i < count && i < pool.length; i++) {
      let pick;
      do { pick = pool[Math.floor(Math.random() * pool.length)]; }
      while (used.has(pick.name) && used.size < pool.length);
      used.add(pick.name);
      result.push({ ...pick });
    }
    return result;
  }

  // 生成单日训练
  function generateWorkoutDay(dayIndex, freq, goal, experience) {
    // 决定部位组合
    let groups = [];
    if (freq.split === "full-body") {
      groups = ["chest", "back", "legs", "shoulders", "core"];
    } else if (freq.split === "push-pull-legs") {
      const cycle = ["push", "pull", "legs"];
      const map = { push: ["chest", "shoulders", "arms"], pull: ["back", "arms"], legs: ["legs", "core"] };
      const key = cycle[dayIndex % 3];
      groups = map[key];
    } else if (freq.split === "upper-lower") {
      const cycle = ["upper", "lower"];
      const key = cycle[dayIndex % 2];
      groups = key === "upper" ? ["chest", "back", "shoulders", "arms"] : ["legs", "core"];
    } else if (freq.split === "ppl-advanced") {
      const cycle = ["push", "pull", "legs", "push", "pull", "legs"];
      const map = {
        push: ["chest", "shoulders", "arms"],
        pull: ["back", "arms"],
        legs: ["legs", "core"],
      };
      groups = map[cycle[dayIndex % 6]];
    }
    const count = experience === "beginner" ? 8 : 10;
    const exercises = pickExercises(groups, count);
    return { exercises, durationMin: freq.minutes };
  }

  // 食物过滤（根据偏好）
  function applyFoodPrefs(foods, prefs) {
    if (!prefs || prefs.length === 0) return foods;
    return foods.filter(f => {
      for (const pref of prefs) {
        const rule = DIET_PREFERENCE_RULES[pref];
        if (rule && !rule(f)) return false;
      }
      return true;
    });
  }

  function rand(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // 把「食物 + 份数」标准化成一份带总热量的记录
  // 食材 unitGrams=100，菜肴 unitGrams=整份克数
  function makeItem(food, servings, portionLabel) {
    const s = Math.max(0.1, servings);
    const unit = food.unitGrams || 100;
    return {
      name: food.name,
      category: food.category,
      unitGrams: unit,
      baseServings: +s.toFixed(2),
      servings: +s.toFixed(2),
      grams: Math.round(unit * s),
      kcal: Math.round(food.kcal * s),
      protein: +(food.protein * s).toFixed(1),
      carbs: +(food.carbs * s).toFixed(1),
      fat: +(food.fat * s).toFixed(1),
      portion: portionLabel || (Math.round(unit * s) + "g"),
      warn: !!food.warn,
      confidence: "high",
      perUnit: { kcal: food.kcal, protein: food.protein, carbs: food.carbs, fat: food.fat },
    };
  }

  // 调整份数后重算这一项的宏量与克数
  function rescaleItem(item, servings) {
    const s = Math.max(0.1, +servings.toFixed(2));
    item.servings = s;
    item.grams = Math.round((item.unitGrams || 100) * s);
    item.kcal = Math.round(item.perUnit.kcal * s);
    item.protein = +(item.perUnit.protein * s).toFixed(1);
    item.carbs = +(item.perUnit.carbs * s).toFixed(1);
    item.fat = +(item.perUnit.fat * s).toFixed(1);
    item.portion = item.grams + "g";
  }

  // 按热量反算份数（食材 = 目标热量 / 每 100g 热量）
  function servingsForKcal(food, kcal) {
    const perUnit = food.kcal || 1;
    return Math.min(3, Math.max(0.3, kcal / perUnit));
  }

  function findFoodByName(name) {
    return ALL_FOODS.find(f => f.name === name) || null;
  }

  function searchFoods(keyword, limit = 6) {
    const kw = (keyword || "").trim();
    if (!kw) return [];
    const lower = kw.toLowerCase();
    const scored = [];
    for (const f of ALL_FOODS) {
      const n = f.name.toLowerCase();
      const idx = n.indexOf(lower);
      if (idx === -1) continue;
      scored.push({ food: f, score: idx === 0 ? 0 : idx });
    }
    return scored.sort((a, b) => a.score - b.score).slice(0, limit).map(s => s.food);
  }

  // 每餐卡路里分配
  function mealKcalSplit(targetKcal) {
    const breakfast = Math.round(targetKcal * 0.28);
    const lunch = Math.round(targetKcal * 0.33);
    const dinner = Math.round(targetKcal * 0.33);
    const snack = targetKcal - breakfast - lunch - dinner;
    return [
      { name: "早餐", targetKcal: breakfast, time: "08:00" },
      { name: "午餐", targetKcal: lunch, time: "12:30" },
      { name: "晚餐", targetKcal: dinner, time: "18:30" },
      { name: "加餐", targetKcal: snack, time: "15:30" },
    ];
  }

  // 根据目标卡路里组一顿饭（主食 + 蛋白 + 蔬菜）
  function composeMeal(targetKcal, prefs) {
    const staples = applyFoodPrefs(FOOD_LIBRARY.staple, prefs);
    const proteins = applyFoodPrefs(FOOD_LIBRARY.protein, prefs);
    const veggies = applyFoodPrefs(FOOD_LIBRARY.veggie, prefs);

    const staple = rand(staples);
    const protein = rand(proteins);
    const veggie = rand(veggies);

    return [
      makeItem(protein, servingsForKcal(protein, targetKcal * 0.4)),
      makeItem(staple, servingsForKcal(staple, targetKcal * 0.4)),
      makeItem(veggie, servingsForKcal(veggie, targetKcal * 0.2)),
    ];
  }

  // 用一道家常菜 + 一份蔬菜组成一顿（让中式家常菜真正进入方案）
  function composeDishMeal(targetKcal, prefs) {
    const dishes = applyFoodPrefs(FOOD_LIBRARY.dish, prefs).filter(d => d.category === "菜肴");
    if (!dishes.length) return composeMeal(targetKcal, prefs);
    const dish = rand(dishes);
    const veg = rand(applyFoodPrefs(FOOD_LIBRARY.veggie, prefs));
    return [
      makeItem(dish, servingsForKcal(dish, targetKcal * 0.72)),
      makeItem(veg, servingsForKcal(veg, targetKcal * 0.28)),
    ];
  }

  // 每周训练日的分布：均匀铺开，休息日不堆在同一天
  function workoutDaySet(n) {
    const patterns = {
      1: [3], 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5],
      5: [1, 2, 3, 5, 6], 6: [1, 2, 3, 4, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6],
    };
    return patterns[n] || [0, 1, 2, 3, 4, 5, 6].slice(0, n);
  }

  // 生成完整 7 天计划
  function generatePlan(profile) {
    const freq = getTrainingFrequency(profile);
    const targetKcal = calcTargetKcal(profile);
    const macro = calcMacro(targetKcal, profile.goal);
    const mealSplit = mealKcalSplit(targetKcal);
    const trainDays = workoutDaySet(freq.days);

    const days = [];
    let seq = 0;
    for (let i = 0; i < 7; i++) {
      // 休息日不生成训练，保证一周训练次数与 freq.days 一致
      const workout = trainDays.includes(i)
        ? generateWorkoutDay(seq++, freq, profile.goal, profile.experience)
        : null;

      const meals = mealSplit.map(m => {
        let foods;
        if (m.name === "加餐") foods = composeSnack(m.targetKcal, profile.prefs);
        else if (m.name === "午餐" || m.name === "晚餐") {
          foods = Math.random() < 0.55
            ? composeDishMeal(m.targetKcal, profile.prefs)
            : composeMeal(m.targetKcal, profile.prefs);
        } else {
          foods = composeMeal(m.targetKcal, profile.prefs);
        }
        return { name: m.name, time: m.time, targetKcal: m.targetKcal, foods };
      });

      days.push({
        index: i,
        workout: workout, // null = 休息日
        meals,
        dateOffset: i,
      });
    }

    return {
      generatedAt: Date.now(),
      startDate: fmtDate(getMonday(new Date())),
      targetKcal,
      macro,
      freq,
      days,
    };
  }

  function composeSnack(targetKcal, prefs) {
    const snacks = applyFoodPrefs([...FOOD_LIBRARY.snack, ...FOOD_LIBRARY.fruit], prefs);
    const pick = rand(snacks);
    return [makeItem(pick, servingsForKcal(pick, targetKcal))];
  }

  function getMonday(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff));
  }

  // ============== 拍照验收（模拟 ML） ==============

  // 目标宏量：按这餐热量占全天的比例，从全天宏量里换算
  function targetMacroForKcal(mealKcal) {
    const plan = db.plan;
    if (!plan || !plan.macro) return { protein: 0, carbs: 0, fat: 0 };
    const ratio = mealKcal / (plan.targetKcal || mealKcal);
    return {
      protein: plan.macro.protein * ratio,
      carbs: plan.macro.carbs * ratio,
      fat: plan.macro.fat * ratio,
    };
  }

  // 验收分区：偏差 ≤25% 达标 / 25–40% 提示 / >40% 超限
  // 依据：营养识别模型 MAPE 约 15%，阈值再收紧会让用户长期 FAIL
  function verdictOf(diffPct) {
    const abs = Math.abs(diffPct);
    if (abs <= 0.25) return "pass";
    if (abs <= 0.40) return "warn";
    return "fail";
  }

  function analyzeFood(items, mealTargetKcal) {
    const totals = items.reduce((acc, it) => {
      acc.kcal += it.kcal || 0;
      acc.protein += it.protein || 0;
      acc.carbs += it.carbs || 0;
      acc.fat += it.fat || 0;
      return acc;
    }, { kcal: 0, protein: 0, carbs: 0, fat: 0 });

    const target = mealTargetKcal || 1;
    const targetMacro = targetMacroForKcal(target);
    const diffPct = (totals.kcal - target) / target;
    const verdict = verdictOf(diffPct);

    let headline;
    if (verdict === "pass") {
      headline = `这餐刚好落在区间里（目标 ${Math.round(target)} kcal）`;
    } else if (verdict === "warn") {
      headline = totals.kcal > target
        ? `比目标多 ${Math.round(totals.kcal - target)} kcal，下一餐收一点就好`
        : `比目标少 ${Math.round(target - totals.kcal)} kcal，补一点更稳`;
    } else {
      headline = totals.kcal > target
        ? `这餐热量偏多 ${Math.round(totals.kcal - target)} kcal，不用焦虑，按下面的做就补回来`
        : `这餐热量偏少 ${Math.round(target - totals.kcal)} kcal，再补一份主食或蛋白`;
    }

    return {
      foods: items,
      totalKcal: Math.round(totals.kcal),
      macro: {
        protein: Math.round(totals.protein),
        carbs: Math.round(totals.carbs),
        fat: Math.round(totals.fat),
      },
      targetKcal: Math.round(target),
      targetMacro: {
        protein: Math.round(targetMacro.protein),
        carbs: Math.round(targetMacro.carbs),
        fat: Math.round(targetMacro.fat),
      },
      verdict,
      diffPct: Math.round(diffPct * 100),
      headline,
      actions: buildNextActions(totals, target, targetMacro),
      lowConfidence: items.some(i => i.confidence === "low" || i.confidence === "medium"),
    };
  }

  // 不评判对错，只给「接下来怎么吃」
  function buildNextActions(totals, target, targetMacro) {
    const actions = [];
    const kcalGap = target - totals.kcal;
    const pGap = targetMacro.protein - totals.protein;
    const cGap = targetMacro.carbs - totals.carbs;
    const fGap = targetMacro.fat - totals.fat;

    if (kcalGap < -target * 0.25) {
      const walk = Math.max(15, Math.round(Math.abs(kcalGap) / 4.5 / 5) * 5);
      actions.push(`多出的约 ${Math.abs(Math.round(kcalGap))} kcal，饭后快走 ${walk} 分钟就能抵掉大半`);
    }
    if (pGap > Math.max(4, targetMacro.protein * 0.2)) {
      const eggs = Math.min(3, Math.ceil(pGap / 6.5));
      actions.push(`蛋白还差约 ${Math.round(pGap)}g，再加 ${eggs} 个鸡蛋（约 ${Math.round(eggs * 6.5)}g 蛋白）就补齐`);
    } else if (pGap < -Math.max(8, targetMacro.protein * 0.35)) {
      actions.push("蛋白已经够了，下一餐把肉换成蔬菜，主食保持");
    }
    if (cGap < -Math.max(10, targetMacro.carbs * 0.3)) {
      actions.push("碳水偏多，下一餐主食减半，蛋白和蔬菜照常");
    }
    if (fGap < -Math.max(6, targetMacro.fat * 0.35)) {
      actions.push("脂肪偏多，今天剩下两餐尽量清蒸、水煮");
    }
    if (kcalGap > target * 0.25) {
      actions.push(`还差 ${Math.round(kcalGap)} kcal，下午加一份水果或一杯无糖酸奶就够`);
    }
    if (actions.length === 0) actions.push("这一餐在可接受范围，按计划吃下一餐就行");
    return actions.slice(0, 3);
  }

  // 根据照片文件名模拟识别结果（Demo 无真实模型）
  function mockDetectFromPhoto(fileName) {
    const lower = (fileName || "").toLowerCase();
    const name = fileName || "";
    const keywordMap = {
      rice: "白米饭", 米饭: "白米饭", 炒饭: "蛋炒饭",
      chicken: "鸡胸肉", 鸡肉: "鸡腿肉", 宫保: "宫保鸡丁",
      egg: "鸡蛋", 鸡蛋: "鸡蛋", 番茄: "番茄炒蛋(1份)",
      beef: "牛肉", 牛肉: "牛肉", 牛腩: "西红柿炖牛腩",
      fish: "三文鱼", 鱼: "清蒸鲈鱼", 酸菜鱼: "酸菜鱼",
      salad: "健身沙拉鸡胸", 沙拉: "健身沙拉鸡胸",
      pizza: "披萨(2块)", 披萨: "披萨(2块)",
      burger: "汉堡+薯条", 汉堡: "汉堡+薯条",
      noodle: "牛肉面", 面: "牛肉面", 拉面: "兰州拉面",
      milk: "牛奶", 奶: "牛奶", 酸奶: "无糖酸奶",
      apple: "苹果", 苹果: "苹果",
      banana: "香蕉", 香蕉: "香蕉",
      火锅: "麻辣烫(多肉)", 麻辣烫: "麻辣烫(多素)",
      水果: "苹果", 菜: "清炒时蔬(1份)", 红烧肉: "红烧肉",
    };

    const items = [];
    for (const kw in keywordMap) {
      if (lower.includes(kw.toLowerCase()) || name.includes(kw)) {
        const food = findFoodByName(keywordMap[kw]);
        if (food) items.push(makeItem(food, food.category === "菜肴" ? 1 : 1.5));
        break;
      }
    }

    if (items.length === 0) {
      // 40% 概率高热量（用来展示「超限」这一档）
      const healthy = Math.random() > 0.4;
      if (healthy) {
        items.push(
          makeItem(rand(FOOD_LIBRARY.staple), 1.5),
          makeItem(rand(FOOD_LIBRARY.protein), 1.2),
          makeItem(rand(FOOD_LIBRARY.veggie), 1.5),
        );
      } else {
        const bad = FOOD_LIBRARY.dish.filter(d => d.warn);
        items.push(makeItem(bad[Math.floor(Math.random() * bad.length)], 1));
      }
    }

    // 置信度：让用户一眼知道哪一项需要手动确认
    items.forEach((it, i) => {
      it.confidence = i === 0 ? "high" : (Math.random() > 0.35 ? "high" : "medium");
      if (Math.random() > 0.85) it.confidence = "low";
    });
    return items;
  }

  // ============== 提醒系统 ==============
  // 微信「健康管理」类目拿不到长期订阅消息，这里只做一次性订阅：
  // 每次进入小程序静默补充 1 条额度（每日上限 3 条），
  // 额度之外靠「系统日历」+「小程序内待办红点」兜底。
  const SUB_DAILY_CAP = 3;

  function getSubQuota() {
    if (!db.settings) db.settings = {};
    const today = getTodayDate();
    if (db.settings.subQuotaDate !== today) {
      db.settings.subQuotaDate = today;
      db.settings.subQuota = 1; // 进入即静默续订 1 条
      saveDB(db);
    }
    return db.settings.subQuota || 0;
  }

  function addSubQuota(n = 1) {
    if (!db.settings) db.settings = {};
    const today = getTodayDate();
    if (db.settings.subQuotaDate !== today) {
      db.settings.subQuotaDate = today;
      db.settings.subQuota = 0;
    }
    db.settings.subQuota = Math.min(SUB_DAILY_CAP, (db.settings.subQuota || 0) + n);
    saveDB(db);
    return db.settings.subQuota;
  }

  function timeToMinutes(t) {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  }

  function nowMinutes() {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }

  // 已到点但还没验收的餐数（用于红点）
  function pendingMealsCount() {
    const plan = db.plan?.days?.[getDayOffset()];
    if (!plan) return 0;
    const logs = db.logs[getTodayDate()] || { meals: {} };
    return plan.meals.filter((m, i) => !(logs.meals || {})[i] && timeToMinutes(m.time) <= nowMinutes()).length;
  }

  // 兜底方案一：导出 .ics，让系统日历替我们提醒
  function downloadCalendar() {
    const defaults = { breakfast: "08:00", lunch: "12:30", dinner: "18:30", workout: "19:00" };
    const times = db.settings?.reminders || defaults;
    const labels = { breakfast: "FitMeal 早餐", lunch: "FitMeal 午餐", dinner: "FitMeal 晚餐", workout: "FitMeal 训练" };
    const start = new Date();
    start.setDate(start.getDate() + 1);
    const dateStr = fmtDate(start).replace(/-/g, "");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//FitMeal//Demo//CN", "CALSCALE:GREGORIAN"];
    Object.keys(defaults).forEach(k => {
      const [h, m] = (times[k] || defaults[k]).split(":");
      lines.push(
        "BEGIN:VEVENT",
        `UID:fitmeal-${k}-${dateStr}@demo`,
        `DTSTAMP:${dateStr}T000000`,
        `DTSTART:${dateStr}T${h}${m}00`,
        "DURATION:PT15M",
        "RRULE:FREQ=DAILY;COUNT=30",
        `SUMMARY:${labels[k]}`,
        "DESCRIPTION:打开 FitMeal 完成今日安排",
        "BEGIN:VALARM", "TRIGGER:-PT10M", "ACTION:DISPLAY", "DESCRIPTION:FitMeal 提醒", "END:VALARM",
        "END:VEVENT"
      );
    });
    lines.push("END:VCALENDAR");

    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fitmeal-reminders.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    toast("日历提醒已生成，导入后 30 天有效");
  }

  // ============== 日志 & 进度 ==============
  function fmtDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function getTodayDate() {
    return fmtDate(new Date());
  }

  function getDayOffset() {
    if (!db.plan) return 0;
    const start = new Date(db.plan.startDate + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.max(0, Math.min(6, Math.floor((today - start) / 86400000)));
  }

  function ensureLog(date) {
    if (!db.logs[date]) db.logs[date] = { workouts: {}, meals: {}, kcal: 0, protein: 0 };
    if (typeof db.logs[date].kcal !== "number") db.logs[date].kcal = 0;
    if (typeof db.logs[date].protein !== "number") db.logs[date].protein = 0;
    if (!db.logs[date].mealKcal) db.logs[date].mealKcal = {};
    if (!db.logs[date].mealProtein) db.logs[date].mealProtein = {};
    return db.logs[date];
  }

  function markLog(type, id, done = true) {
    const date = getTodayDate();
    const log = ensureLog(date);
    if (type === "workout") log.workouts[id] = done;
    if (type === "meal") log.meals[id] = done;
    saveDB(db);
  }

  // 验收确认：记录这餐整体结果，计入本周额度
  // 同一餐重复验收只覆盖旧值，不重复累加
  function logMealResult(mealIdx, analysis) {
    const date = getTodayDate();
    const log = ensureLog(date);
    log.mealKcal[mealIdx] = analysis.totalKcal;
    log.mealProtein[mealIdx] = analysis.macro.protein;
    // 直接由每餐记录汇总，重复验收只覆盖不叠加
    log.kcal = Object.values(log.mealKcal).reduce((a, b) => a + b, 0);
    log.protein = Object.values(log.mealProtein).reduce((a, b) => a + b, 0);
    log.meals[mealIdx] = true;
    saveDB(db);
  }

  // 周预算：周额度平摊到每天，允许周末聚餐，不按日卡死
  function getWeeklyBudget() {
    if (!db.plan) return null;
    const quota = db.plan.targetKcal * 7;
    let consumed = 0;
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(db.plan.startDate + "T00:00:00");
      d.setDate(d.getDate() + i);
      const key = fmtDate(d);
      const kcal = (db.logs[key] && db.logs[key].kcal) || 0;
      consumed += kcal;
      days.push({ key, kcal });
    }
    const remaining = quota - consumed;
    const todayKey = getTodayDate();
    const todayIdx = days.findIndex(d => d.key === todayKey);
    const daysLeft = todayIdx >= 0 ? Math.max(1, 7 - todayIdx) : 7;
    // 均摊到剩下几天，上下限避免极端
    const dailySuggest = Math.round(remaining / daysLeft);
    const todaySuggest = Math.max(
      Math.round(db.plan.targetKcal * 0.6),
      Math.min(Math.round(db.plan.targetKcal * 1.5), dailySuggest)
    );
    const weekendBuffer = Math.max(0, remaining - db.plan.targetKcal * daysLeft);
    return {
      quota,
      consumed,
      remaining,
      daysLeft,
      todaySuggest,
      weekendBuffer,
      verifiedCount: Object.keys(db.logs).filter(k => db.logs[k].kcal > 0).length,
    };
  }

  function getTodayCompletion() {
    const date = getTodayDate();
    const logs = db.logs[date] || { workouts: {}, meals: {} };
    const todayPlan = db.plan?.days?.[getDayOffset()];
    if (!todayPlan) return { workoutDone: 0, workoutTotal: 0, mealDone: 0, mealTotal: 0, totalPct: 0 };

    const workoutTotal = todayPlan.workout ? todayPlan.workout.exercises.length : 0;
    const workoutDone = todayPlan.workout
      ? todayPlan.workout.exercises.filter((_, i) => logs.workouts[i]).length
      : 0;

    const mealTotal = todayPlan.meals.length;
    const mealDone = todayPlan.meals.filter((_, i) => logs.meals[i]).length;

    const total = workoutTotal + mealTotal;
    const done = workoutDone + mealDone;
    return {
      workoutDone, workoutTotal,
      mealDone, mealTotal,
      totalPct: total === 0 ? 0 : Math.round(done / total * 100),
    };
  }

  function getWeeklyStats() {
    if (!db.plan) return [];
    const start = new Date(db.plan.startDate + "T00:00:00");
    const days = [];
    const today = new Date();
    today.setHours(0,0,0,0);

    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const dateStr = fmtDate(d);
      const logs = db.logs[dateStr] || { workouts: {}, meals: {} };
      const planDay = db.plan.days[i];
      if (!planDay) { days.push({ day: i, label: `${d.getMonth()+1}/${d.getDate()}`, pct: 0 }); continue; }

      const wTotal = planDay.workout ? planDay.workout.exercises.length : 0;
      const wDone = planDay.workout
        ? planDay.workout.exercises.filter((_, j) => logs.workouts[j]).length
        : 0; // 休息日不计入分母，避免完成度超过 100%
      const mDone = planDay.meals.filter((_, j) => logs.meals[j]).length;
      const mTotal = planDay.meals.length;

      const total = wTotal + mTotal;
      const done = wDone + mDone;
      const pct = d > today ? null : (total === 0 ? 0 : Math.round(done / total * 100));
      days.push({ day: i, label: `${d.getMonth()+1}/${d.getDate()}`, pct, future: d > today });
    }
    return days;
  }

  function getWeekReview() {
    const stats = getWeeklyStats();
    const past = stats.filter(s => !s.future && s.pct !== null);
    if (past.length === 0) return [];

    const hasActivity = Object.keys(db.logs || {}).some(k => {
      const l = db.logs[k] || {};
      return (l.kcal || 0) > 0
        || !!(l.meals && Object.values(l.meals).some(Boolean))
        || !!(l.workouts && Object.values(l.workouts).some(Boolean));
    });

    const items = [];
    if (!hasActivity) {
      // 刚开始用：不展示 0% 这种打击性结论
      items.push("本周还没有记录，今天从一餐或一次训练开始就行，不用追求满分");
      const budget0 = getWeeklyBudget();
      if (budget0) items.push(`本周额度 ${budget0.quota} kcal，吃超了也只是提示，不会判你失败`);
      items.push(`训练频率：每周 ${db.plan?.freq?.days} 天，每次 ${db.plan?.freq?.minutes} 分钟`);
      return items;
    }

    const avg = Math.round(past.reduce((s, d) => s + d.pct, 0) / past.length);
    const above90 = past.filter(d => d.pct >= 90).length;
    const below60 = past.filter(d => d.pct < 60).length;
    items.push(`本周平均完成度 <strong>${avg}%</strong>`);
    if (above90 >= 3) items.push(`有 <strong>${above90}</strong> 天完成度 ≥ 90%，继续保持！🔥`);
    if (below60 >= 2) items.push(`有 <strong>${below60}</strong> 天完成不足 60%，试试把计划拆得更简单？`);

    const budget = getWeeklyBudget();
    if (budget) {
      const usedPct = Math.round(budget.consumed / budget.quota * 100);
      items.push(`本周额度已用 <strong>${usedPct}%</strong>，还剩 ${Math.max(0, Math.round(budget.remaining))} kcal，周末聚餐不用有负担`);
    }

    const recs = [...(db.records || [])].sort((a, b) => a.date.localeCompare(b.date));
    if (recs.length >= 2) {
      const delta = (recs[recs.length - 1].weight - recs[0].weight).toFixed(1);
      const sign = delta > 0 ? "+" : "";
      items.push(`体重变化 <strong>${sign}${delta} kg</strong>（${recs[0].date} → ${recs[recs.length - 1].date}）`);
    }
    items.push(`下周训练频率建议：${db.plan?.freq?.days} 天，每日 ${db.plan?.freq?.minutes} 分钟`);
    return items;
  }

  // ============== UI 渲染 ==============
  const $ = sel => document.querySelector(sel);
  const $$ = sel => document.querySelectorAll(sel);

  function showView(name) {
    $$(".view").forEach(v => v.classList.toggle("active", v.id === `view-${name}`));
  }

  function renderGreeting() {
    const d = new Date();
    const hour = d.getHours();
    const greet = hour < 11 ? "早上好" : hour < 14 ? "中午好" : hour < 18 ? "下午好" : "晚上好";
    const weekday = ["周日","周一","周二","周三","周四","周五","周六"][d.getDay()];
    $("#date-line").textContent = `${greet} · 今天是 ${d.getMonth()+1}月${d.getDate()}日 ${weekday}`;
  }

  function renderTodaySummary() {
    if (!db.plan) return;
    $("#sum-kcal").textContent = db.plan.targetKcal;
    $("#sum-carbs").textContent = db.plan.macro.carbs + "g";
    $("#sum-protein").textContent = db.plan.macro.protein + "g";
    $("#sum-fat").textContent = db.plan.macro.fat + "g";
    renderWeekBudget();
  }

  // 周预算：不按日卡死，周末可以聚餐
  function renderWeekBudget() {
    const el = $("#week-budget");
    if (!el) return;
    const b = getWeeklyBudget();
    if (!b) { el.innerHTML = ""; return; }
    const usedPct = Math.min(100, Math.round(b.consumed / b.quota * 100));
    el.innerHTML = `
      <div class="wb-row">
        <span>本周额度</span>
        <span><strong>${b.consumed}</strong> / ${b.quota} kcal</span>
      </div>
      <div class="wb-track"><div class="wb-fill" style="width:${usedPct}%"></div></div>
      <div class="wb-note">
        今天建议 ≤ <strong>${b.todaySuggest}</strong> kcal
        ${b.weekendBuffer > 0 && b.daysLeft > 1 ? ` · 周末聚餐还留了 ${Math.round(b.weekendBuffer)} kcal 弹性` : ""}
      </div>`;
  }

  function renderTodayTimeline() {
    const el = $("#today-timeline");
    el.innerHTML = "";
    const todayPlan = db.plan?.days?.[getDayOffset()];
    if (!todayPlan) {
      el.innerHTML = '<div class="empty-state"><div class="emoji">📅</div><div>今天还没有计划</div></div>';
      return;
    }

    const logs = db.logs[getTodayDate()] || { workouts: {}, meals: {} };
    const items = [];

    // 训练
    if (todayPlan.workout) {
      const allDone = todayPlan.workout.exercises.every((_, i) => logs.workouts[i]);
      items.push({
        time: "19:00",
        minutes: timeToMinutes("19:00"),
        title: "💪 今日训练",
        desc: `${todayPlan.workout.exercises.length} 个动作 · 约 ${todayPlan.workout.durationMin} 分钟`,
        id: "workout",
        done: allDone,
        action: allDone ? "已完成" : "去打卡",
        onClick: () => {
          // 标记全部完成
          todayPlan.workout.exercises.forEach((_, i) => markLog("workout", i, true));
          toast("训练完成！🔥");
          renderAll();
        },
      });
    } else {
      items.push({
        time: "全天",
        minutes: 0,
        title: "😴 训练休息日",
        desc: "建议散步 30 分钟或充分拉伸",
        done: true,
        action: "已标记",
        onClick: null,
      });
    }

    // 三餐
    todayPlan.meals.forEach((meal, i) => {
      const done = logs.meals[i];
      items.push({
        time: meal.time,
        minutes: timeToMinutes(meal.time),
        title: `🍽️ ${meal.name}`,
        desc: `目标 ${meal.targetKcal} kcal`,
        id: `meal-${i}`,
        done: !!done,
        action: done ? "已达标" : "拍照验收",
        onClick: () => openPhotoModal(meal, i),
      });
    });

    items.sort((a, b) => a.minutes - b.minutes);

    items.forEach(it => {
      const div = document.createElement("div");
      div.className = "timeline-item" + (it.done ? " done" : "");
      div.innerHTML = `
        <div class="check-mark">✓</div>
        <div class="tl-time">${it.time}</div>
        <div class="tl-body">
          <div class="tl-title">${it.title}</div>
          <div class="tl-desc">${it.desc}</div>
        </div>
        <button class="tl-action">${it.action}</button>
      `;
      div.querySelector(".tl-action").onclick = it.onClick;
      el.appendChild(div);
    });
  }

  function renderTodayCompletion() {
    const c = getTodayCompletion();
    const offset = 471 - (471 * c.totalPct / 100);
    $("#ring-today").style.strokeDashoffset = offset;
    $("#ring-value").textContent = c.totalPct + "%";
    $("#today-completion").textContent = `完成 ${c.workoutDone + c.mealDone}/${c.workoutTotal + c.mealTotal}`;

    let hint = "";
    if (c.totalPct >= 90) hint = "🎉 太棒了，今天就要完美收官！";
    else if (c.totalPct >= 60) hint = "💪 加油，还差一点点就达标了";
    else if (c.totalPct > 0) hint = "⏰ 今天刚开始，记得吃完饭拍照验收哦";
    else hint = "📌 今日计划已备好，点击上面时间线开始吧";
    $("#progress-hint").textContent = hint;
  }

  function renderWeekDays() {
    const el = $("#week-days");
    el.innerHTML = "";
    if (!db.plan) return;

    const start = new Date(db.plan.startDate + "T00:00:00");
    const today = new Date(); today.setHours(0,0,0,0);

    db.plan.days.forEach((day, i) => {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const dateStr = fmtDate(d);
      const isToday = dateStr === fmtDate(today);
      const wd = ["日","一","二","三","四","五","六"][d.getDay()];
      const div = document.createElement("div");
      div.className = "week-day" + (isToday ? " today" : "");
      div.dataset.day = i;
      div.innerHTML = `
        <div class="wd-date">${d.getMonth()+1}/${d.getDate()}</div>
        <div class="wd-weekday">${wd}</div>
        <div class="wd-dot ${day.workout ? "has-workout" : "has-meal"}"></div>
      `;
      div.onclick = () => showDayDetail(i);
      el.appendChild(div);
    });

    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    $("#week-label").textContent = `第 1 周 · ${start.getMonth()+1}/${start.getDate()} – ${end.getMonth()+1}/${end.getDate()}`;
  }

  // 动作示意图：把 DEMO_POSES 中的火柴人画成 SVG
  function exerciseFigure(demo) {
    const p = DEMO_POSES[demo] || DEMO_POSES.push;
    const poly = pts => `<polyline points="${pts.map(q => q.join(",")).join(" ")}" />`;
    return `<svg class="ex-svg" viewBox="-2 1 58 52" aria-hidden="true">
      <defs>
        <marker id="fm-arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="currentColor" />
        </marker>
      </defs>
      <circle cx="${p.head[0]}" cy="${p.head[1]}" r="3.6" />
      ${poly([p.shoulder, p.hip])}
      ${p.arm.map(poly).join("")}
      ${p.leg.map(poly).join("")}
      <line class="ex-arrow" x1="${p.arrow[0]}" y1="${p.arrow[1]}" x2="${p.arrow[2]}" y2="${p.arrow[3]}" marker-end="url(#fm-arrow)" />
    </svg>`;
  }

  function showDayDetail(dayIdx) {
    if (!db.plan) return;
    const day = db.plan.days[dayIdx];
    const el = $("#day-detail-card");
    if (!day) { el.innerHTML = ""; return; }

    let html = "";

    // 训练：每个动作带示意图 + 可展开的 3 条要点
    if (day.workout) {
      html += `<div class="day-section-title">💪 训练 · 约 ${day.workout.durationMin} 分钟</div>`;
      day.workout.exercises.forEach(ex => {
        html += `
          <details class="ex-details">
            <summary>
              <span class="ex-figure">${exerciseFigure(ex.demo)}</span>
              <span class="ex-main">
                <span class="ex-name">${ex.name}</span>
                <span class="ex-meta">${ex.sets} 组 × ${ex.reps} · ${ex.equipment}</span>
              </span>
              <span class="ex-more">要点</span>
            </summary>
            <div class="ex-tips">
              ${(ex.tips || []).map(t => `<div class="ex-tip">${t}</div>`).join("")}
            </div>
          </details>`;
      });
    } else {
      html += `<div class="day-section-title">😴 训练休息日</div><p style="color:var(--text-muted);font-size:13px">建议散步 30 分钟或充分拉伸</p>`;
    }

    // 饮食
    html += `<div class="day-section-title">🍽️ 饮食方案</div>`;
    [...day.meals]
      .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time))
      .forEach(m => {
      html += `<div class="meal-card" style="margin-bottom:10px">
        <div class="meal-card-header"><span>${m.name} · ${m.time}</span><span>${m.targetKcal} kcal</span></div>
        <div class="meal-card-body">`;
      m.foods.forEach(f => {
        html += `<div class="meal-food-item"><span>${f.name} <span style="color:var(--text-subtle)">(${f.portion})</span></span><span class="food-kcal">${f.kcal} kcal</span></div>`;
      });
      html += `</div></div>`;
    });

    el.innerHTML = html;
    $$("#week-days .week-day").forEach(d => {
      d.classList.toggle("selected", parseInt(d.dataset.day) === dayIdx);
    });
  }

  function renderMealList() {
    const el = $("#meal-list");
    el.innerHTML = "";
    const todayPlan = db.plan?.days?.[getDayOffset()];
    if (!todayPlan) { el.innerHTML = '<div class="empty-state"><div class="emoji">🍽️</div><div>今日饮食</div></div>'; return; }

    const logs = db.logs[getTodayDate()] || { workouts: {}, meals: {} };

    todayPlan.meals
      .map((meal, i) => ({ meal, i }))
      .sort((a, b) => timeToMinutes(a.meal.time) - timeToMinutes(b.meal.time))
      .forEach(({ meal, i }) => {
      const done = !!logs.meals[i];
      let html = `
        <div class="meal-card">
          <div class="meal-card-header">
            <span>${meal.name} · ${meal.time}</span>
            <span>${meal.targetKcal} kcal</span>
          </div>
          <div class="meal-card-body">`;
      meal.foods.forEach(f => {
        html += `<div class="meal-food-item">
          <span>${f.name} <span style="color:var(--text-subtle)">(${f.portion})</span></span>
          <span class="food-kcal">${f.kcal} kcal</span>
        </div>`;
      });
      html += `
            <div class="meal-actions">
              ${done
                ? `<button class="btn-done" disabled>✓ 已验收</button>`
                : `<button class="btn-check" data-meal="${i}">📸 拍照验收</button>`}
            </div>
          </div>
        </div>`;
      el.innerHTML += html;
    });

    // 绑定按钮
    el.querySelectorAll("[data-meal]").forEach(btn => {
      btn.onclick = () => openPhotoModal(todayPlan.meals[parseInt(btn.dataset.meal)], parseInt(btn.dataset.meal));
    });
  }

  function renderWeekChart() {
    const el = $("#week-chart");
    el.innerHTML = "";
    const stats = getWeeklyStats();
    if (stats.length === 0) { el.innerHTML = '<div class="empty-state">暂无数据</div>'; return; }

    stats.forEach(s => {
      const div = document.createElement("div");
      div.className = "bar";
      if (!s.future) div.classList.add("value");
      const h = s.future ? 4 : Math.max(4, s.pct * 1.3);
      div.style.height = h + "px";
      const label = s.future ? s.label + "·" : s.label;
      div.innerHTML = `<span class="bar-label">${label}</span>`;
      if (!s.future && s.pct > 0) div.innerHTML += `<span class="bar-value-label">${s.pct}%</span>`;
      el.appendChild(div);
    });
  }

  function renderWeekReview() {
    const el = $("#week-review");
    const items = getWeekReview();
    el.innerHTML = items.map(i => `<div class="review-item">${i}</div>`).join("");
  }

  function renderReminderSettings() {
    const el = $("#reminder-settings");
    if (!el) return;
    const defaults = { breakfast: "08:00", lunch: "12:30", dinner: "18:30", workout: "19:00" };
    const saved = db.settings?.reminders || defaults;
    const labels = { breakfast: "早餐", lunch: "午餐", dinner: "晚餐", workout: "训练" };
    const quota = getSubQuota();
    const pending = pendingMealsCount();

    let html = `
      <div class="sub-quota-card">
        <div class="sub-quota-title">📩 今日订阅额度 <strong>${quota}</strong> / ${SUB_DAILY_CAP} 条</div>
        <div class="sub-quota-note">微信「健康管理」类目拿不到长期订阅，只能一次性订阅：每次打开小程序自动补 1 条，用来推「到点该吃了」。</div>
        <div class="sub-quota-note">额度用完也不影响 —— 日历提醒 + 小程序内红点兜底。</div>
        <div class="sub-quota-pending">到点还没验收：<strong>${pending}</strong> 餐</div>
      </div>`;

    Object.keys(defaults).forEach(k => {
      html += `
        <div class="reminder-row">
          <span>${labels[k]} 提醒</span>
          <input type="time" data-key="${k}" value="${saved[k] || defaults[k]}">
        </div>`;
    });
    el.innerHTML = html;

    el.querySelectorAll("input[type=time]").forEach(inp => {
      inp.onchange = () => {
        if (!db.settings.reminders) db.settings.reminders = {};
        db.settings.reminders[inp.dataset.key] = inp.value;
        saveDB(db);
        toast("提醒时间已更新");
      };
    });
  }

  // 体重 / 围度周记录 + 趋势线
  function renderWeightCard() {
    const el = $("#weight-card");
    if (!el) return;
    const recs = (db.records || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    const latest = recs[recs.length - 1];
    const first = recs[0];

    let head = "还没有记录，先记一次起点";
    if (latest) {
      head = `当前 <strong>${latest.weight}</strong> kg`;
      if (recs.length > 1) {
        const delta = latest.weight - first.weight;
        head += ` · 较起点 ${delta > 0 ? "+" : ""}${delta.toFixed(1)} kg`;
      }
      if (latest.waist) head += ` · 腰围 ${latest.waist} cm`;
    }

    el.innerHTML = `
      <div class="weight-head">${head}</div>
      ${recs.length >= 2 ? weightChartSVG(recs) : ""}
      <div class="weight-form">
        <input type="number" step="0.1" min="30" max="200" id="w-weight" placeholder="体重 kg" value="${latest ? latest.weight : (db.profile?.weight || "")}">
        <input type="number" step="0.5" min="40" max="160" id="w-waist" placeholder="腰围 cm" value="${latest?.waist || ""}">
        <button class="btn primary small" id="w-save">记录</button>
      </div>
      <div class="weight-hint">建议每周固定时间（晨起空腹）记录一次，看趋势不看单日</div>`;

    el.querySelector("#w-save").onclick = () => {
      const w = parseFloat(el.querySelector("#w-weight").value);
      const waist = parseFloat(el.querySelector("#w-waist").value);
      if (!w || w < 30 || w > 200) { toast("请填写合理体重"); return; }
      if (!db.records) db.records = [];
      const today = getTodayDate();
      const exist = db.records.find(r => r.date === today);
      if (exist) {
        exist.weight = w;
        if (waist) exist.waist = waist;
      } else {
        db.records.push({ date: today, weight: w, waist: waist || null });
      }
      saveDB(db);
      toast("已记录 ✍️");
      renderWeightCard();
      renderWeekReview();
    };
  }

  function weightChartSVG(recs) {
    const last = recs.slice(-12);
    const ws = last.map(r => r.weight);
    const min = Math.min(...ws) - 0.5;
    const max = Math.max(...ws) + 0.5;
    const W = 300, H = 110, pad = 12;
    const span = Math.max(1, last.length - 1);
    const x = i => pad + i * (W - pad * 2) / span;
    const y = v => H - pad - ((v - min) / (max - min)) * (H - pad * 2);
    const points = last.map((r, i) => `${x(i).toFixed(1)},${y(r.weight).toFixed(1)}`).join(" ");
    const dots = last.map((r, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(r.weight).toFixed(1)}" r="3.5" fill="var(--primary)"/>`).join("");
    const tail = last[last.length - 1];
    return `<svg class="weight-svg" viewBox="0 0 ${W} ${H}">
      <polyline points="${points}" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linejoin="round"/>
      ${dots}
      <text x="${pad}" y="${H - 2}" class="chart-axis">${last[0].date.slice(5)}</text>
      <text x="${W - pad}" y="${H - 2}" class="chart-axis" text-anchor="end">${tail.date.slice(5)}</text>
    </svg>`;
  }

  // 饮食 Tab 的待办红点
  function renderTabBadges() {
    const btn = document.querySelector('.tab-btn[data-tab="diet"]');
    if (!btn) return;
    const pending = pendingMealsCount();
    let badge = btn.querySelector(".tab-badge");
    if (pending > 0) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "tab-badge";
        btn.appendChild(badge);
      }
      badge.textContent = pending;
    } else if (badge) {
      badge.remove();
    }
  }

  function renderAll() {
    if (!db.profile) return;
    renderGreeting();
    renderTodaySummary();
    renderTodayTimeline();
    renderTodayCompletion();
    renderWeekDays();
    showDayDetail(getDayOffset());
    renderMealList();
    renderWeekChart();
    renderWeekReview();
    renderReminderSettings();
    renderWeightCard();
    renderTabBadges();
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.add("hidden"), 2200);
  }

  // ============== 拍照弹窗 ==============
  // 三级降级：AI 识别 → 手动搜索补录 → 常用食物一键加
  // 任何一步都能确认验收，不因识别失败卡住用户
  let photoState = null;

  function openPhotoModal(meal, mealIdx, fileName) {
    if (!meal) return;
    photoState = { meal, mealIdx, items: null };
    const modal = $("#photo-modal");
    const body = $("#photo-modal-body");
    body.innerHTML = `
      <h2 style="margin-bottom:8px">📸 验收 ${meal.name}</h2>
      <p class="hint-text">目标 ${meal.targetKcal} kcal · ${meal.time}<br>拍照只是估算，误差约 ±15%，份量随时可改。</p>
      <input type="file" id="pf-file" accept="image/*" hidden>
      <div class="pf-capture">
        <button class="btn primary" id="pf-pick">📷 拍照 / 选一张图</button>
        <button class="btn ghost" id="pf-auto">⚡ 直接模拟识别</button>
      </div>
      <div id="pf-result"></div>
    `;
    modal.classList.remove("hidden");
    modal.querySelectorAll("[data-close]").forEach(e => e.onclick = () => modal.classList.add("hidden"));

    const fileInput = body.querySelector("#pf-file");
    body.querySelector("#pf-pick").onclick = () => fileInput.click();
    fileInput.onchange = e => {
      const f = e.target.files[0];
      if (!f) return;
      runPhotoAnalysis(f.name || "photo_" + Date.now());
    };
    body.querySelector("#pf-auto").onclick = () => runPhotoAnalysis("meal_" + meal.name + "_" + Date.now());
    if (fileName) runPhotoAnalysis(fileName);
  }

  function runPhotoAnalysis(fileName) {
    const resultEl = $("#pf-result");
    if (!resultEl) return;
    resultEl.innerHTML = `
      <div class="pf-loading">
        <div class="spinner"></div>
        <p>AI 正在识别食物和份量…</p>
        <p class="pf-tip">识别不出来也没关系，下面可以手动补录</p>
      </div>`;
    setTimeout(() => {
      photoState.items = mockDetectFromPhoto(fileName);
      renderPhotoResult();
    }, 1300);
  }

  function currentPhotoItems() {
    return (photoState && photoState.items) || [];
  }

  function renderPhotoResult() {
    const resultEl = $("#pf-result");
    if (!resultEl) return;
    resultEl.innerHTML = `
      <div class="pf-note">AI 估算，误差约 ±15%；以吃进去的量为准，不必精确到个位数。</div>
      <div class="pf-section-title">${currentPhotoItems().length ? `🔍 识别到 ${currentPhotoItems().length} 样食物` : "🔍 还没识别到食物（可直接用下面的搜索补录）"}</div>
      <div class="pf-detected" id="pf-items"></div>
      <div class="pf-fallback">
        <div class="pf-section-title">识别不准？手动补录（约 3 秒）</div>
        <div class="pf-search-row">
          <input type="text" id="pf-search" placeholder="搜食物，如 米饭 / 鸡胸 / 红烧肉" autocomplete="off">
        </div>
        <div class="pf-search-list" id="pf-search-list"></div>
        <div class="pf-quick" id="pf-quick"></div>
      </div>
      <div id="pf-analysis"></div>
    `;
    renderPhotoItems();
    renderQuickFoods();
    renderPhotoAnalysis(analyzeFood(currentPhotoItems(), photoState.meal.targetKcal));

    const search = resultEl.querySelector("#pf-search");
    search.oninput = () => {
      const list = resultEl.querySelector("#pf-search-list");
      const foods = searchFoods(search.value, 5);
      if (!foods.length) {
        list.innerHTML = search.value.trim()
          ? `<div class="pf-empty">没找到，换个更短的关键词试试</div>`
          : "";
        return;
      }
      list.innerHTML = foods.map(f => {
        const unit = f.category === "菜肴" ? "整份" : (f.unitGrams || 100) + "g";
        return `<button class="pf-suggest" data-add="${f.name}">${f.name}<span>${f.kcal} kcal/${unit}</span></button>`;
      }).join("");
      list.querySelectorAll("[data-add]").forEach(b => b.onclick = () => addFoodByName(b.dataset.add));
    };
  }

  // 只刷新结果区域，保住搜索框焦点
  function refreshPhotoAnalysis() {
    const analysis = analyzeFood(currentPhotoItems(), photoState.meal.targetKcal);
    renderPhotoItems();
    renderPhotoAnalysis(analysis);
  }

  function renderPhotoItems() {
    const el = $("#pf-items");
    if (!el) return;
    const items = currentPhotoItems();
    if (!items.length) {
      el.innerHTML = `<div class="pf-empty">还没识别到食物，用下面的搜索补一条吧</div>`;
      return;
    }
    el.innerHTML = items.map((f, i) => {
      const confClass = f.confidence === "high" ? "high" : f.confidence === "medium" ? "medium" : "low";
      const confLabel = f.confidence === "high" ? "高置信" : f.confidence === "medium" ? "中置信" : "低置信";
      const activeScale = s => Math.abs(f.servings - f.baseServings * s) < 0.02 ? " active" : "";
      return `
        <div class="pf-item">
          <div class="pf-item-top">
            <div class="pf-left">
              <span class="pf-name">${f.name}</span>
              <span class="pf-confidence ${confClass}">${confLabel}</span>
              <span class="pf-grams">${f.grams}g</span>
            </div>
            <div class="pf-right">
              <span class="pf-kcal">${f.kcal} kcal</span>
              <button class="pf-del" data-del="${i}" title="移除">✕</button>
            </div>
          </div>
          <div class="pf-portions">
            ${Object.keys(PORTION_SCALE).map(k => {
              const p = PORTION_SCALE[k];
              return `<button class="pf-portion${activeScale(p.scale)}" data-portion="${i}" data-scale="${p.scale}">${p.label}</button>`;
            }).join("")}
            <span class="pf-portion-hint">份量不对就点一下</span>
          </div>
        </div>`;
    }).join("");

    el.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
      photoState.items.splice(parseInt(b.dataset.del), 1);
      refreshPhotoAnalysis();
    });
    el.querySelectorAll("[data-portion]").forEach(b => b.onclick = () => {
      const it = photoState.items[parseInt(b.dataset.portion)];
      if (!it) return;
      rescaleItem(it, it.baseServings * parseFloat(b.dataset.scale));
      refreshPhotoAnalysis();
    });
  }

  function renderQuickFoods() {
    const el = $("#pf-quick");
    if (!el) return;
    const favs = db.settings?.favorites || QUICK_FOODS;
    el.innerHTML = `
      <div class="pf-quick-label">常用食物 · 点一下直接加</div>
      <div class="pf-quick-chips">
        ${favs.map(n => `<button class="pf-chip" data-quick="${n}">+ ${n}</button>`).join("")}
      </div>`;
    el.querySelectorAll("[data-quick]").forEach(b => b.onclick = () => addFoodByName(b.dataset.quick));
  }

  function addFoodByName(name) {
    const food = findFoodByName(name);
    if (!food) return;
    photoState.items.push(makeItem(food, 1));
    refreshPhotoAnalysis();
    toast(`已加入 ${name}`);
  }

  function renderPhotoAnalysis(analysis) {
    const el = $("#pf-analysis");
    if (!el) return;
    const verdictLabel = analysis.verdict === "pass"
      ? "✓ 这餐刚好"
      : analysis.verdict === "warn"
        ? "⚠ 稍偏一点，好调整"
        : "△ 偏差较大，按建议补";
    const bars = [
      { name: "碳水", cls: "m-carbs", v: analysis.macro.carbs, t: analysis.targetMacro.carbs },
      { name: "蛋白", cls: "m-protein", v: analysis.macro.protein, t: analysis.targetMacro.protein },
      { name: "脂肪", cls: "m-fat", v: analysis.macro.fat, t: analysis.targetMacro.fat },
    ];
    el.innerHTML = `
      <div class="pf-section-title">📊 宏量对比</div>
      <div class="macro-bars">
        ${bars.map(b => `
          <div class="macro-bar ${b.cls}">
            <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, b.v / Math.max(1, b.t) * 100)}%"></div></div>
            <div class="bar-val">${b.v}g</div>
            <div class="bar-label">${b.name} / 目标 ${Math.round(b.t)}g</div>
          </div>`).join("")}
      </div>
      <div class="pf-summary ${analysis.verdict}">
        <div class="pf-verdict">${verdictLabel}</div>
        <div class="pf-total">实际约 <strong>${analysis.totalKcal}</strong> kcal · 目标 ${analysis.targetKcal} kcal（${analysis.diffPct > 0 ? "+" : ""}${analysis.diffPct}%）</div>
        <div class="pf-headline">${analysis.headline}</div>
        <div class="pf-actions">
          ${analysis.actions.map(a => `<div class="pf-action">→ ${a}</div>`).join("")}
        </div>
      </div>
      <div class="pf-confirm-row">
        <button class="btn primary" id="pf-confirm">确认验收 · 计入今日</button>
        <button class="btn ghost" id="pf-retry">重新识别</button>
      </div>`;
    el.querySelector("#pf-confirm").onclick = () => {
      if (!currentPhotoItems().length) { toast("先补一条食物再验收"); return; }
      logMealResult(photoState.mealIdx, analysis);
      toast(analysis.verdict === "pass" ? "记下了，这餐刚好" : "记下了，按建议调整下一餐");
      $("#photo-modal").classList.add("hidden");
      renderAll();
    };
    el.querySelector("#pf-retry").onclick = () => runPhotoAnalysis("retry_" + Date.now());
  }

  // ============== Onboarding ==============
  function initOnboarding() {
    const form = $("#profile-form");
    let step = 1;

    function goStep(n) {
      step = n;
      $$(".form-step").forEach(s => s.classList.toggle("hidden", parseInt(s.dataset.step) !== step));
      $("#btn-prev").classList.toggle("hidden", step === 1);
      $("#btn-next").classList.toggle("hidden", step === 3);
      $("#btn-submit").classList.toggle("hidden", step !== 3);
      updatePreview();
    }

    function updatePreview() {
      if (step < 3) return;
      const data = new FormData(form);
      const p = collectProfile(data);
      const bmr = calcBMR(p);
      const tdee = calcTDEE(p);
      const target = calcTargetKcal(p);
      const freq = getTrainingFrequency(p);
      $("#pv-bmr").textContent = Math.round(bmr);
      $("#pv-tdee").textContent = Math.round(tdee);
      $("#pv-target").textContent = Math.round(target);
      $("#pv-frequency").textContent = `${freq.days} 天 · 每次 ${freq.minutes} 分钟`;
    }

    function collectProfile(data) {
      const prefs = [];
      data.getAll("pref").forEach(p => prefs.push(p));
      return {
        gender: data.get("gender"),
        height: parseFloat(data.get("height")),
        weight: parseFloat(data.get("weight")),
        age: parseInt(data.get("age")),
        activity: data.get("activity"),
        goal: data.get("goal"),
        experience: data.get("experience"),
        prefs,
      };
    }

    // Chip 高亮（多选只切换自己，单选才清空同组）
    $$(".chip input").forEach(input => {
      input.addEventListener("change", () => {
        const chip = input.closest(".chip");
        if (input.type === "checkbox") {
          chip.classList.toggle("active", input.checked);
        } else {
          input.closest(".chip-group").querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
          chip.classList.add("active");
        }
      });
    });

    $("#btn-next").onclick = () => {
      const data = new FormData(form);
      // 简单校验
      const h = parseFloat(data.get("height"));
      const w = parseFloat(data.get("weight"));
      const a = parseInt(data.get("age"));
      if (step === 1 && (h < 120 || h > 230 || w < 30 || w > 200 || a < 12 || a > 80)) {
        toast("请填写合理的身体数据"); return;
      }
      goStep(step + 1);
    };
    $("#btn-prev").onclick = () => goStep(step - 1);
    form.onsubmit = e => {
      e.preventDefault();
      const data = new FormData(form);
      const profile = collectProfile(data);
      db.profile = profile;
      db.plan = generatePlan(profile);
      saveDB(db);
      enterApp();
    };

    // 初始化默认选项高亮
    goStep(1);
    // 默认选中的 chip 高亮
    setTimeout(() => {
      $$(".chip input:checked").forEach(i => i.closest(".chip").classList.add("active"));
    }, 50);
  }

  // Tab 切换
  function initTabs() {
    $$(".tab-btn").forEach(btn => {
      btn.onclick = () => {
        $$(".tab-btn").forEach(b => b.classList.remove("active"));
        $$(".tab-pane").forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        $(`.tab-pane[data-pane="${btn.dataset.tab}"]`).classList.add("active");
        // 每次切 tab 刷新
        renderAll();
      };
    });
  }

  // 周计划左右切换（当前只有 1 周计划）
  function initWeekNav() {
    const prev = $("#week-prev");
    const next = $("#week-next");
    if (!prev || !next) return;
    const tip = () => toast("目前只生成了第 1 周计划，重新设置画像可生成新的一周");
    prev.onclick = tip;
    next.onclick = tip;
  }

  // 提醒：一次性订阅额度 + 系统日历兜底
  function initNotifications() {
    const calBtn = $("#btn-calendar");
    if (calBtn) calBtn.onclick = downloadCalendar;

    const subBtn = $("#btn-sub-renew");
    if (subBtn) {
      subBtn.onclick = () => {
        const q = addSubQuota(1);
        toast(`已续订 1 条，今日额度 ${q}/${SUB_DAILY_CAP}`);
        renderReminderSettings();
      };
    }
  }

  // 编辑画像
  function initProfileEdit() {
    const btn = $("#btn-profile-edit");
    if (!btn) return;
    btn.onclick = () => {
      if (!confirm("确定要重新设置画像吗？当前计划会被替换。")) return;
      db.profile = null; db.plan = null;
      saveDB(db);
      location.reload();
    };
  }

  // 手动模拟照片
  function initPhotoInput() {
    const btn = $("#btn-photo-open");
    const input = $("#photo-input");
    const preview = $("#photo-preview");
    if (!btn) return;
    btn.onclick = () => input.click();
    input.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        preview.innerHTML = `<img src="${ev.target.result}" alt="预览">`;
        // 直接打开验收弹窗，优先选还没验收的那一餐
        const todayPlan = db.plan?.days?.[getDayOffset()];
        if (todayPlan && todayPlan.meals.length) {
          const logs = db.logs[getTodayDate()] || { meals: {} };
          const idx = todayPlan.meals.findIndex((_, i) => !logs.meals[i]);
          const targetIdx = idx >= 0 ? idx : 0;
          openPhotoModal(todayPlan.meals[targetIdx], targetIdx, file.name);
        }
      };
      reader.readAsDataURL(file);
    };
  }

  // ============== 启动 ==============
  function enterApp() {
    showView("app");
    getSubQuota(); // 每次进入静默续订 1 条一次性订阅额度
    renderAll();
  }

  function init() {
    initOnboarding();
    initTabs();
    initWeekNav();
    initNotifications();
    initProfileEdit();
    initPhotoInput();

    if (db.profile && db.plan) {
      enterApp();
    } else {
      showView("onboarding");
    }
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", App.init);
