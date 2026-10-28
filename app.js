/* ========= FitMeal · Main App Logic ========= */

const App = (() => {

  // ============== 存储层 ==============
  const DB_KEY = "fitmeal_db_v1";

  function loadDB() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) return JSON.parse(raw);
    } catch(e) {}
    return { profile: null, plan: null, logs: {}, settings: {} };
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
      const cycle = ["push", "pull", "legs", "push", "pull", "rest"];
      const map = {
        push: ["chest", "shoulders", "arms"],
        pull: ["back", "arms"],
        legs: ["legs", "core"],
      };
      const key = cycle[dayIndex % 6];
      if (key === "rest") return null;
      groups = map[key];
    }
    const count = experience === "beginner" ? 8 : 10;
    const exercises = pickExercises(groups, count);
    const estDuration = exercises.reduce((s, e) => s + e.duration, 0) / 60 + 10; // + warmup
    return { exercises, durationMin: Math.round(estDuration) };
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

  // 根据目标卡路里组一顿饭
  function composeMeal(targetKcal, prefs) {
    // 用拳头法则式组合：主食 + 蛋白 + 蔬菜
    const staples = applyFoodPrefs(FOOD_LIBRARY.staple, prefs);
    const proteins = applyFoodPrefs(FOOD_LIBRARY.protein, prefs);
    const veggies = applyFoodPrefs(FOOD_LIBRARY.veggie, prefs);

    // 随机挑选，调整份量凑目标
    const staple = staples[Math.floor(Math.random() * staples.length)];
    const protein = proteins[Math.floor(Math.random() * proteins.length)];
    const veggie = veggies[Math.floor(Math.random() * veggies.length)];

    // 估算份量（每份100g的实际份量倍数）
    const plan = [];
    // 蛋白占 ~40%
    const pGrams = Math.round((targetKcal * 0.4) / (protein.kcal / 100));
    plan.push({ ...protein, portion: pGrams + "g" });
    // 主食占 ~40%
    const sGrams = Math.round((targetKcal * 0.4) / (staple.kcal / 100));
    plan.push({ ...staple, portion: sGrams + "g" });
    // 蔬菜占 ~20%
    const vGrams = Math.round((targetKcal * 0.2) / (veggie.kcal / 100));
    plan.push({ ...veggie, portion: vGrams + "g" });

    return plan;
  }

  // 生成完整 7 天计划
  function generatePlan(profile) {
    const freq = getTrainingFrequency(profile);
    const targetKcal = calcTargetKcal(profile);
    const macro = calcMacro(targetKcal, profile.goal);
    const mealSplit = mealKcalSplit(targetKcal);

    const days = [];
    for (let i = 0; i < 7; i++) {
      // 判断是训练日还是休息日
      const isWorkoutDay = (freq.split === "ppl-advanced")
        ? (i % 6 !== 5) // ppl advanced 第6天休息
        : (i * freq.days < 7 * freq.days / 7 ? (i % Math.ceil(7/freq.days) !== 0) : (i < freq.days));

      const workout = generateWorkoutDay(i, freq, profile.goal, profile.experience);
      const meals = mealSplit.map(m => ({
        name: m.name,
        time: m.time,
        targetKcal: m.targetKcal,
        foods: m.name === "加餐" ? composeSnack(m.targetKcal, profile.prefs) : composeMeal(m.targetKcal, profile.prefs),
      }));

      days.push({
        index: i,
        workout: workout, // null = 休息日
        meals,
        dateOffset: i,
      });
    }

    return {
      generatedAt: Date.now(),
      startDate: getMonday(new Date()).toISOString().slice(0, 10),
      targetKcal,
      macro,
      freq,
      days,
    };
  }

  function composeSnack(targetKcal, prefs) {
    const snacks = applyFoodPrefs([...FOOD_LIBRARY.snack, ...FOOD_LIBRARY.fruit], prefs);
    const pick = snacks[Math.floor(Math.random() * snacks.length)];
    const grams = Math.round(targetKcal / (pick.kcal / 100));
    return [{ ...pick, portion: grams + "g" }];
  }

  function getMonday(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff));
  }

  // ============== 拍照验收（模拟 ML） ==============

  function analyzeFood(foodItemsFromPhoto, mealTargetKcal, mealTargetMacro) {
    // foodItemsFromPhoto: [{name, detectedKcal, confidence}]
    let totalKcal = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0;
    for (const item of foodItemsFromPhoto) {
      totalKcal += item.kcal || 0;
      totalProtein += item.protein || 0;
      totalCarbs += item.carbs || 0;
      totalFat += item.fat || 0;
    }

    const kcalDiff = Math.abs(totalKcal - mealTargetKcal) / mealTargetKcal;
    const proteinDiff = mealTargetMacro?.protein ? Math.abs(totalProtein - mealTargetMacro.protein * (mealTargetKcal / (mealTargetKcal * 0.4))) / (mealTargetMacro.protein * (mealTargetKcal / (mealTargetKcal * 0.4))) : 0;

    let verdict = "pass";
    if (kcalDiff > 0.30) verdict = "fail";
    else if (kcalDiff > 0.15 || proteinDiff > 0.30) verdict = "warn";

    return {
      foods: foodItemsFromPhoto,
      totalKcal: Math.round(totalKcal),
      macro: {
        protein: Math.round(totalProtein),
        carbs: Math.round(totalCarbs),
        fat: Math.round(totalFat),
      },
      targetKcal: mealTargetKcal,
      verdict,
      messages: verdict === "pass"
        ? ["完美！这餐吃对了 🎉", "卡路里和营养素都在目标范围内"]
        : verdict === "warn"
          ? ["接近目标，但还差一点 ⚠️", totalKcal > mealTargetKcal ? "卡路里略高了，下一餐可以清淡些" : "卡路里偏低，可以加个小加餐"]
          : ["这餐不太达标 😅", totalKcal > mealTargetKcal ? "热量超标了 30%+，建议少吃油炸/甜点" : "热量明显不足，小心基础代谢下降"],
    };
  }

  // 根据照片文件名/哈希模拟识别结果
  function mockDetectFromPhoto(fileName) {
    // 尝试从文件名中"猜"食物，找不到就返回随机菜肴
    const lower = (fileName || "").toLowerCase();
    const keywordMap = {
      rice: "白米饭", 米饭: "白米饭",
      chicken: "鸡胸肉", 鸡: "鸡胸肉",
      egg: "鸡蛋", 蛋: "鸡蛋",
      beef: "牛肉", 牛肉: "牛肉",
      fish: "三文鱼", 鱼: "三文鱼",
      salad: "健身沙拉鸡胸", 沙拉: "健身沙拉鸡胸",
      pizza: "披萨(2块)", 披萨: "披萨(2块)",
      burger: "汉堡+薯条", 汉堡: "汉堡+薯条",
      noodle: "牛肉面", 面: "牛肉面",
      milk: "牛奶", 奶: "牛奶",
      apple: "苹果", 苹果: "苹果",
      banana: "香蕉", 香蕉: "香蕉",
      水果: "苹果",
      菜: "清炒时蔬",
    };

    let match = null;
    for (const kw in keywordMap) {
      if (lower.includes(kw) || fileName?.includes(kw)) {
        match = keywordMap[kw];
        break;
      }
    }

    // 如果匹配到，构造菜肴；否则 30% 概率随机一组健康组合，70% 随机
    const foods = [];
    if (match) {
      const found = FOOD_LIBRARY.dish.find(f => f.name.includes(match)) || FOOD_LIBRARY.protein.find(f => f.name.includes(match)) || FOOD_LIBRARY.staple.find(f => f.name.includes(match));
      if (found) {
        foods.push({
          ...found,
          kcal: Math.round(found.kcal * (found.portion ? (parseFloat(found.portion) / 100) : 1.5)),
          confidence: "high",
        });
      }
    }

    // 如果还是空，随机选一些
    if (foods.length === 0) {
      // 50% 概率健康组合，50% 概率高热量（用来展示 FAIL）
      const healthy = Math.random() > 0.4;
      if (healthy) {
        const pick1 = FOOD_LIBRARY.staple[Math.floor(Math.random() * FOOD_LIBRARY.staple.length)];
        const pick2 = FOOD_LIBRARY.protein[Math.floor(Math.random() * FOOD_LIBRARY.protein.length)];
        const pick3 = FOOD_LIBRARY.veggie[Math.floor(Math.random() * FOOD_LIBRARY.veggie.length)];
        foods.push(
          { ...pick1, kcal: Math.round(pick1.kcal * 1.5), portion: "150g", confidence: Math.random() > 0.3 ? "high" : "medium" },
          { ...pick2, kcal: Math.round(pick2.kcal * 1.2), portion: "120g", confidence: "high" },
          { ...pick3, kcal: Math.round(pick3.kcal * 1.5), portion: "150g", confidence: Math.random() > 0.5 ? "medium" : "high" },
        );
      } else {
        // 随机高热量菜肴
        const bad = FOOD_LIBRARY.dish.filter(d => d.warn);
        const pick = bad[Math.floor(Math.random() * bad.length)];
        foods.push({ ...pick, kcal: pick.kcal, portion: pick.portion, confidence: "high" });
      }
    }

    return foods;
  }

  // ============== 提醒系统 ==============
  function scheduleReminders() {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    // 清除已注册（简化：不取消，每次只加）
    const plan = db.plan;
    if (!plan) return;

    // 只提醒今天的
    const today = new Date();
    const start = new Date(plan.startDate);
    const dayOffset = Math.floor((today - start) / 86400000);
    if (dayOffset < 0 || dayOffset > 6) return;

    const todayPlan = plan.days[dayOffset];
    if (!todayPlan) return;

    // 检查时间是否在未来
    const now = today.getHours() * 60 + today.getMinutes();
    for (const meal of todayPlan.meals) {
      const [h, m] = meal.time.split(":").map(Number);
      const mealMinutes = h * 60 + m;
      if (mealMinutes > now) {
        setTimeout(() => sendNotification(`🍽️ ${meal.name}时间到`, `目标 ${meal.targetKcal} kcal，点击查看推荐`),
          (mealMinutes - now) * 60 * 1000);
      }
    }

    if (todayPlan.workout) {
      const workoutHour = 19 * 60; // 默认19:00训练
      if (workoutHour > now) {
        setTimeout(() => sendNotification(`💪 训练时间`, `今日有 ${todayPlan.workout.exercises.length} 个动作等你`),
          (workoutHour - now) * 60 * 1000);
      }
    }
  }

  function sendNotification(title, body) {
    try { new Notification(title, { body }); } catch(e) {}
  }

  // ============== 日志 & 进度 ==============
  function getTodayDate() {
    return new Date().toISOString().slice(0, 10);
  }

  function getDayOffset() {
    if (!db.plan) return 0;
    const start = new Date(db.plan.startDate);
    const today = new Date();
    return Math.max(0, Math.min(6, Math.floor((today - start) / 86400000)));
  }

  function markLog(type, id, done = true) {
    const date = getTodayDate();
    if (!db.logs[date]) db.logs[date] = { workouts: {}, meals: {} };
    if (type === "workout") db.logs[date].workouts[id] = done;
    if (type === "meal") db.logs[date].meals[id] = done;
    saveDB(db);
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
    const start = new Date(db.plan.startDate);
    const days = [];
    const today = new Date();
    today.setHours(0,0,0,0);

    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const logs = db.logs[dateStr] || { workouts: {}, meals: {} };
      const planDay = db.plan.days[i];
      if (!planDay) { days.push({ day: i, label: `${d.getMonth()+1}/${d.getDate()}`, pct: 0 }); continue; }

      const wTotal = planDay.workout ? planDay.workout.exercises.length : 0;
      const wDone = planDay.workout
        ? planDay.workout.exercises.filter((_, j) => logs.workouts[j]).length
        : (planDay.workout === null ? 1 : 0); // 休息日自动完成
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
    const avg = Math.round(past.reduce((s, d) => s + d.pct, 0) / past.length);
    const above90 = past.filter(d => d.pct >= 90).length;
    const below60 = past.filter(d => d.pct < 60).length;
    const items = [];
    items.push(`本周平均完成度 <strong>${avg}%</strong>`);
    if (above90 >= 3) items.push(`有 <strong>${above90}</strong> 天完成度 ≥ 90%，继续保持！🔥`);
    if (below60 >= 2) items.push(`有 <strong>${below60}</strong> 天完成不足 60%，试试把计划拆得更简单？`);
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
    $("#sum-carbs").textContent = db.plan.macro.carbs;
    $("#sum-protein").textContent = db.plan.macro.protein;
    $("#sum-fat").textContent = db.plan.macro.fat;
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
        title: `🍽️ ${meal.name}`,
        desc: `目标 ${meal.targetKcal} kcal`,
        id: `meal-${i}`,
        done: !!done,
        action: done ? "已达标" : "拍照验收",
        onClick: () => openPhotoModal(meal, i),
      });
    });

    items.forEach(it => {
      const div = document.createElement("div");
      div.className = "timeline-item" + (it.done ? " done" : "");
      div.innerHTML = `
        <div class="check-mark">✓</div>
        <div class="tl-body">
          <div class="tl-title">${it.title}</div>
          <div class="tl-desc">${it.desc}</div>
        </div>
        <div class="tl-time">${it.time}</div>
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

    const start = new Date(db.plan.startDate);
    const today = new Date(); today.setHours(0,0,0,0);

    db.plan.days.forEach((day, i) => {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const isToday = dateStr === today.toISOString().slice(0,10);
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

    const nextMonday = new Date(start);
    nextMonday.setDate(nextMonday.getDate() + 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    $("#week-label").textContent = `第 1 周 · ${start.getMonth()+1}/${start.getDate()} – ${end.getMonth()+1}/${end.getDate()}`;
  }

  function showDayDetail(dayIdx) {
    if (!db.plan) return;
    const day = db.plan.days[dayIdx];
    const el = $("#day-detail-card");
    if (!day) { el.innerHTML = ""; return; }

    let html = "";

    // 训练
    if (day.workout) {
      html += `<div class="day-section-title">💪 训练 · 约 ${day.workout.durationMin} 分钟</div>`;
      day.workout.exercises.forEach((ex, i) => {
        html += `
          <div class="exercise-item">
            <span class="ex-name">${ex.name}</span>
            <span class="ex-detail">${ex.sets}组 × ${ex.reps}</span>
          </div>`;
      });
    } else {
      html += `<div class="day-section-title">😴 训练休息日</div><p style="color:var(--text-muted);font-size:13px">建议散步 30 分钟或充分拉伸</p>`;
    }

    // 饮食
    html += `<div class="day-section-title">🍽️ 饮食方案</div>`;
    day.meals.forEach(m => {
      html += `<div class="meal-card" style="margin-bottom:10px">
        <div class="meal-card-header"><span>${m.name} · ${m.time}</span><span>${m.targetKcal} kcal</span></div>
        <div class="meal-card-body">`;
      m.foods.forEach(f => {
        html += `<div class="meal-food-item"><span>${f.name} <span style="color:var(--text-subtle)">(${f.portion})</span></span><span class="food-kcal">${f.kcal} kcal</span></div>`;
      });
      html += `</div></div>`;
    });

    el.innerHTML = html;
  }

  function renderMealList() {
    const el = $("#meal-list");
    el.innerHTML = "";
    const todayPlan = db.plan?.days?.[getDayOffset()];
    if (!todayPlan) { el.innerHTML = '<div class="empty-state"><div class="emoji">🍽️</div><div>今日饮食</div></div>'; return; }

    const logs = db.logs[getTodayDate()] || { workouts: {}, meals: {} };

    todayPlan.meals.forEach((meal, i) => {
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
          <span class="food-kcal">${Math.round(f.kcal * (f.portion ? parseFloat(f.portion)/100 : 1))} kcal</span>
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
    el.innerHTML = "";
    const defaults = { breakfast: "08:00", lunch: "12:30", dinner: "18:30", workout: "19:00" };
    const saved = db.settings?.reminders || defaults;
    const labels = { breakfast: "早餐", lunch: "午餐", dinner: "晚餐", workout: "训练" };
    Object.keys(defaults).forEach(k => {
      el.innerHTML += `
        <div class="reminder-row">
          <span>${labels[k]} 提醒</span>
          <input type="time" data-key="${k}" value="${saved[k] || defaults[k]}">
        </div>`;
    });
    el.querySelectorAll("input[type=time]").forEach(inp => {
      inp.onchange = () => {
        if (!db.settings.reminders) db.settings.reminders = {};
        db.settings.reminders[inp.dataset.key] = inp.value;
        saveDB(db);
        toast("提醒时间已更新");
      };
    });
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
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.add("hidden"), 2200);
  }

  // ============== 拍照弹窗 ==============
  function openPhotoModal(meal, mealIdx) {
    if (!meal) return;
    const modal = $("#photo-modal");
    const body = $("#photo-modal-body");
    body.innerHTML = `
      <h2 style="margin-bottom:10px">📸 验收 ${meal.name}</h2>
      <p class="hint-text">请对准餐盘俯拍，光线充足。<br>我们会自动识别食物种类和份量。</p>
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <button class="btn primary small" id="pf-auto">🔄 自动模拟识别</button>
      </div>
      <div id="pf-result"></div>
    `;
    modal.classList.remove("hidden");
    body.querySelector("#pf-auto").onclick = () => runPhotoAnalysis(meal, mealIdx, body);
    modal.querySelectorAll("[data-close]").forEach(e => e.onclick = () => modal.classList.add("hidden"));
  }

  function runPhotoAnalysis(meal, mealIdx, body) {
    const resultEl = body.querySelector("#pf-result");
    resultEl.innerHTML = `<div class="spinner"></div><p style="text-align:center;color:var(--text-muted);font-size:13px">AI 正在分析你的照片...</p>`;

    setTimeout(() => {
      // 模拟识别
      const detected = mockDetectFromPhoto("meal_" + meal.name + "_" + Date.now());
      const analysis = analyzeFood(detected, meal.targetKcal, db.plan?.macro);

      let html = `<div class="pf-section-title">🔍 识别到这些食物</div><div class="pf-detected">`;
      analysis.foods.forEach(f => {
        const confClass = f.confidence === "high" ? "high" : f.confidence === "medium" ? "medium" : "low";
        const confLabel = f.confidence === "high" ? "高置信" : f.confidence === "medium" ? "中置信" : "低置信";
        html += `
          <div class="pf-item">
            <div class="pf-left">
              <span class="pf-name">${f.name}</span>
              <span class="pf-confidence ${confClass}">${confLabel}</span>
            </div>
            <div>${f.kcal} kcal</div>
          </div>`;
      });
      html += `</div>`;

      // 宏量对比
      html += `
        <div class="pf-section-title">📊 宏量对比</div>
        <div class="macro-bars">
          <div class="macro-bar m-carbs">
            <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, analysis.macro.carbs / Math.max(1, analysis.targetKcal * 0.45/4) * 100)}%"></div></div>
            <div class="bar-val">${analysis.macro.carbs}g</div>
            <div class="bar-label">碳水</div>
          </div>
          <div class="macro-bar m-protein">
            <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, analysis.macro.protein / Math.max(1, analysis.targetKcal * 0.3/4) * 100)}%"></div></div>
            <div class="bar-val">${analysis.macro.protein}g</div>
            <div class="bar-label">蛋白</div>
          </div>
          <div class="macro-bar m-fat">
            <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, analysis.macro.fat / Math.max(1, analysis.targetKcal * 0.3/9) * 100)}%"></div></div>
            <div class="bar-val">${analysis.macro.fat}g</div>
            <div class="bar-label">脂肪</div>
          </div>
        </div>`;

      // 结论
      const verdictText = analysis.verdict === "pass" ? "✓ PASS" : analysis.verdict === "warn" ? "⚠ WARN" : "✗ FAIL";
      html += `<div class="pf-summary ${analysis.verdict}">
        <div class="pf-verdict">${verdictText}</div>
        <div class="pf-message">${analysis.messages[0]}</div>
        <div class="pf-summary-row">实际摄入 ${analysis.totalKcal} kcal · 目标 ${analysis.targetKcal} kcal</div>
      </div>`;

      html += `<button class="btn primary" id="pf-confirm">确认验收 · 计入进度</button>`;

      resultEl.innerHTML = html;
      resultEl.querySelector("#pf-confirm").onclick = () => {
        markLog("meal", mealIdx, analysis.verdict !== "fail");
        toast(analysis.verdict === "pass" ? "验收通过 🎉" : analysis.verdict === "warn" ? "已记录，注意调整" : "已记录，下次注意哦");
        $("#photo-modal").classList.add("hidden");
        renderAll();
      };
    }, 1500);
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

    // Chip 高亮
    $$(".chip input").forEach(input => {
      input.addEventListener("change", () => {
        input.closest(".chip-group").querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
        input.closest(".chip").classList.add("active");
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

  // 通知权限
  function initNotifications() {
    const btn = $("#btn-enable-notif");
    if (!btn) return;
    btn.onclick = async () => {
      if (!("Notification" in window)) { toast("当前浏览器不支持通知"); return; }
      try {
        const res = await Notification.requestPermission();
        if (res === "granted") { toast("✅ 通知已开启"); scheduleReminders(); }
        else toast("未获得通知权限");
      } catch(e) { toast("请求失败"); }
    };
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
        // 直接打开验收弹窗
        const todayPlan = db.plan?.days?.[getDayOffset()];
        if (todayPlan && todayPlan.meals[0]) {
          openPhotoModal(todayPlan.meals[0], 0);
        }
      };
      reader.readAsDataURL(file);
    };
  }

  // ============== 启动 ==============
  function enterApp() {
    showView("app");
    renderAll();
    scheduleReminders();
  }

  function init() {
    initOnboarding();
    initTabs();
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
