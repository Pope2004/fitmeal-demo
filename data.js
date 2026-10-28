/* ========= FitMeal · Static Data Libraries ========= */

// 训练动作库（按部位分类）
const EXERCISE_LIBRARY = {
  // 胸部
  chest: [
    { name: "俯卧撑", muscle: "胸", equipment: "徒手", sets: 3, reps: "10-12", duration: 60, essence: "身体成直线，核心收紧，下降到胸部接近地面", mistake: "塌腰或撅屁股" },
    { name: "哑铃卧推", muscle: "胸", equipment: "哑铃", sets: 3, reps: "10", duration: 90, essence: "肩胛收紧，推起时手臂微内收", mistake: "过度外展肩膀" },
    { name: "坐姿器械推胸", muscle: "胸", equipment: "器械", sets: 3, reps: "12", duration: 75, essence: "双脚稳定，推至手臂微伸", mistake: "耸肩借力" },
    { name: "哑铃飞鸟", muscle: "胸", equipment: "哑铃", sets: 3, reps: "12", duration: 60, essence: "肘关节微屈，像抱树一样合拢", mistake: "直臂伸展压力全在关节" },
    { name: "上斜俯卧撑", muscle: "上胸", equipment: "徒手", sets: 3, reps: "8-10", duration: 50, essence: "脚放高位，身体直线", mistake: "重心太靠后" },
  ],
  // 背部
  back: [
    { name: "引体向上", muscle: "背", equipment: "单杠", sets: 3, reps: "6-8", duration: 70, essence: "挺胸，拉到下巴过杠", mistake: "耸肩或前后摆动" },
    { name: "高位下拉", muscle: "背", equipment: "器械", sets: 3, reps: "10-12", duration: 75, essence: "肘向下向后拉，肩胛下沉", mistake: "只靠手臂发力" },
    { name: "哑铃单臂划船", muscle: "背", equipment: "哑铃", sets: 3, reps: "10/侧", duration: 60, essence: "腰背平，肘向后拉触腰侧", mistake: "驼背或转体借力" },
    { name: "坐姿绳索划船", muscle: "背", equipment: "器械", sets: 3, reps: "12", duration: 70, essence: "挺胸，拉至下腹", mistake: "弯腰过度" },
    { name: "反向飞鸟", muscle: "下背/后束", equipment: "哑铃", sets: 3, reps: "15", duration: 50, essence: "肩胛后缩，手臂向外展开", mistake: "耸肩" },
  ],
  // 腿部
  legs: [
    { name: "深蹲", muscle: "股四/臀", equipment: "徒手/杠铃", sets: 3, reps: "12", duration: 90, essence: "膝盖跟脚尖方向，蹲至大腿平行", mistake: "膝盖内扣或塌腰" },
    { name: "箭步蹲", muscle: "股四/臀", equipment: "哑铃", sets: 3, reps: "10/侧", duration: 80, essence: "前膝不超脚尖，后膝接近地面", mistake: "重心前倾" },
    { name: "硬拉", muscle: "后链/臀", equipment: "杠铃", sets: 3, reps: "8", duration: 100, essence: "背平，拉至髋部站直", mistake: "驼背或猛拉" },
    { name: "腿举", muscle: "股四", equipment: "器械", sets: 3, reps: "12", duration: 80, essence: "双脚与肩宽，推至腿微伸", mistake: "膝盖锁死" },
    { name: "臀桥", muscle: "臀", equipment: "徒手/杠铃", sets: 3, reps: "15", duration: 60, essence: "顶至肩髋膝一条直线，顶峰收缩2秒", mistake: "用腰发力" },
    { name: "小腿提踵", muscle: "小腿", equipment: "器械", sets: 3, reps: "15-20", duration: 45, essence: "顶峰停1秒，底部充分拉伸", mistake: "动作太快没控制" },
  ],
  // 肩部
  shoulders: [
    { name: "哑铃肩推", muscle: "前中束", equipment: "哑铃", sets: 3, reps: "10", duration: 75, essence: "推至头顶上方，不锁关节", mistake: "肋骨外翻借力" },
    { name: "侧平举", muscle: "中束", equipment: "哑铃", sets: 3, reps: "12-15", duration: 55, essence: "微屈肘，向两侧抬起至与肩平", mistake: "斜方肌耸肩" },
    { name: "前平举", muscle: "前束", equipment: "哑铃", sets: 3, reps: "12", duration: 50, essence: "抬至眼睛高度，控制下放", mistake: "摆身体借力" },
    { name: "阿诺德推举", muscle: "全肩", equipment: "哑铃", sets: 3, reps: "10", duration: 70, essence: "翻转哑铃同时上推", mistake: "旋转太快失去控制" },
  ],
  // 手臂
  arms: [
    { name: "哑铃二头弯举", muscle: "二头", equipment: "哑铃", sets: 3, reps: "12", duration: 50, essence: "上臂固定，弯举顶峰收缩", mistake: "晃身体甩起来" },
    { name: "绳索下压", muscle: "三头", equipment: "器械", sets: 3, reps: "12", duration: 50, essence: "肘固定，压至手臂伸直", mistake: "下拉过程肘张开" },
    { name: "窄距俯卧撑", muscle: "三头/胸中缝", equipment: "徒手", sets: 3, reps: "10", duration: 50, essence: "手距比肩窄，身体直线", mistake: "塌腰" },
    { name: "锤式弯举", muscle: "肱肌/二头", equipment: "哑铃", sets: 3, reps: "12", duration: 45, essence: "掌心相对，向肩弯举", mistake: "翻转手腕" },
  ],
  // 核心
  core: [
    { name: "平板支撑", muscle: "核心", equipment: "徒手", sets: 3, reps: "30-60秒", duration: 60, essence: "身体成一直线，臀不塌不翘", mistake: "耸肩或塌腰" },
    { name: "卷腹", muscle: "腹直肌", equipment: "徒手", sets: 3, reps: "15-20", duration: 50, essence: "肋骨向下收，而非抬头", mistake: "脖子发力" },
    { name: "俄罗斯转体", muscle: "腹斜", equipment: "徒手/哑铃", sets: 3, reps: "20/侧", duration: 60, essence: "腰背微后仰，核心收紧转体", mistake: "腿乱晃" },
    { name: "登山跑", muscle: "核心/髋屈", equipment: "徒手", sets: 3, reps: "30秒", duration: 50, essence: "平板支撑姿势快速交替提膝", mistake: "臀部起伏太大" },
  ],
};

// 食物库（含每份约100g的热量和宏量，单位 g）
const FOOD_LIBRARY = {
  // 主食
  staple: [
    { name: "白米饭", kcal: 116, protein: 2.6, carbs: 25.6, fat: 0.3, category: "主食" },
    { name: "糙米饭", kcal: 111, protein: 2.6, carbs: 23.0, fat: 0.9, category: "主食" },
    { name: "全麦面", kcal: 137, protein: 5.5, carbs: 27.6, fat: 0.9, category: "主食" },
    { name: "燕麦片", kcal: 380, protein: 16.9, carbs: 66.9, fat: 6.9, category: "主食" },
    { name: "红薯", kcal: 86, protein: 1.6, carbs: 20.1, fat: 0.1, category: "主食" },
    { name: "玉米", kcal: 112, protein: 4.0, carbs: 22.8, fat: 1.2, category: "主食" },
    { name: "土豆", kcal: 77, protein: 2.0, carbs: 16.5, fat: 0.2, category: "主食" },
    { name: "全麦面包", kcal: 246, protein: 10.0, carbs: 49.0, fat: 3.6, category: "主食" },
    { name: "馒头", kcal: 223, protein: 7.0, carbs: 47.0, fat: 1.1, category: "主食" },
  ],
  // 蛋白类
  protein: [
    { name: "鸡胸肉", kcal: 133, protein: 19.4, carbs: 2.5, fat: 5.0, category: "蛋白" },
    { name: "鸡腿肉", kcal: 181, protein: 16.0, carbs: 0, fat: 13.0, category: "蛋白" },
    { name: "牛肉", kcal: 125, protein: 19.9, carbs: 2.0, fat: 4.2, category: "蛋白" },
    { name: "瘦猪肉", kcal: 143, protein: 20.3, carbs: 1.5, fat: 6.2, category: "蛋白" },
    { name: "三文鱼", kcal: 139, protein: 17.2, carbs: 0, fat: 7.8, category: "蛋白" },
    { name: "鸡蛋", kcal: 144, protein: 13.3, carbs: 2.8, fat: 8.8, category: "蛋白" },
    { name: "蛋白（水煮）", kcal: 52, protein: 11.0, carbs: 0.4, fat: 0.1, category: "蛋白" },
    { name: "北豆腐", kcal: 98, protein: 12.2, carbs: 2.5, fat: 4.8, category: "蛋白" },
    { name: "虾仁", kcal: 99, protein: 20.5, carbs: 2.5, fat: 0.7, category: "蛋白" },
    { name: "牛奶", kcal: 54, protein: 3.0, carbs: 3.4, fat: 3.2, category: "蛋白" },
    { name: "希腊酸奶", kcal: 59, protein: 10.0, carbs: 3.6, fat: 0.4, category: "蛋白" },
  ],
  // 蔬菜
  veggie: [
    { name: "西兰花", kcal: 34, protein: 4.1, carbs: 4.3, fat: 0.6, category: "蔬菜" },
    { name: "菠菜", kcal: 28, protein: 2.6, carbs: 4.5, fat: 0.3, category: "蔬菜" },
    { name: "生菜", kcal: 13, protein: 1.3, carbs: 2.0, fat: 0.3, category: "蔬菜" },
    { name: "番茄", kcal: 20, protein: 0.9, carbs: 4.0, fat: 0.2, category: "蔬菜" },
    { name: "黄瓜", kcal: 16, protein: 0.8, carbs: 2.9, fat: 0.2, category: "蔬菜" },
    { name: "胡萝卜", kcal: 37, protein: 1.0, carbs: 8.8, fat: 0.2, category: "蔬菜" },
    { name: "青椒", kcal: 22, protein: 1.0, carbs: 5.4, fat: 0.2, category: "蔬菜" },
    { name: "芦笋", kcal: 18, protein: 1.4, carbs: 3.0, fat: 0.1, category: "蔬菜" },
    { name: "蘑菇", kcal: 24, protein: 2.7, carbs: 4.1, fat: 0.1, category: "蔬菜" },
  ],
  // 水果
  fruit: [
    { name: "苹果", kcal: 52, protein: 0.3, carbs: 13.5, fat: 0.2, category: "水果" },
    { name: "香蕉", kcal: 91, protein: 1.4, carbs: 22.0, fat: 0.2, category: "水果" },
    { name: "橙子", kcal: 48, protein: 0.8, carbs: 11.1, fat: 0.2, category: "水果" },
    { name: "蓝莓", kcal: 57, protein: 0.7, carbs: 14.5, fat: 0.3, category: "水果" },
    { name: "火龙果", kcal: 51, protein: 1.1, carbs: 12.9, fat: 0.3, category: "水果" },
  ],
  // 健康零食/加餐
  snack: [
    { name: "坚果混合", kcal: 607, protein: 20.0, carbs: 20.0, fat: 54.0, category: "零食" },
    { name: "黑巧克力(70%)", kcal: 549, protein: 4.9, carbs: 61.0, fat: 31.0, category: "零食" },
    { name: "蛋白粉(1勺)", kcal: 120, protein: 24.0, carbs: 3.0, fat: 1.0, category: "零食" },
  ],
  // 常见菜肴（估算整份）
  dish: [
    { name: "番茄炒蛋(1份)", kcal: 220, protein: 13.0, carbs: 14.0, fat: 12.0, category: "菜肴", portion: "约250g" },
    { name: "清炒时蔬(1份)", kcal: 90, protein: 4.0, carbs: 8.0, fat: 5.0, category: "菜肴", portion: "约200g" },
    { name: "宫保鸡丁", kcal: 380, protein: 28.0, carbs: 25.0, fat: 18.0, category: "菜肴", portion: "约300g" },
    { name: "红烧肉", kcal: 480, protein: 20.0, carbs: 12.0, fat: 40.0, category: "菜肴", portion: "约150g", warn: true },
    { name: "健身沙拉鸡胸", kcal: 320, protein: 35.0, carbs: 20.0, fat: 10.0, category: "菜肴", portion: "约400g" },
    { name: "牛肉面", kcal: 520, protein: 25.0, carbs: 65.0, fat: 18.0, category: "菜肴", portion: "1碗" },
    { name: "汉堡+薯条", kcal: 880, protein: 35.0, carbs: 95.0, fat: 40.0, category: "菜肴", portion: "1份", warn: true },
    { name: "炸鸡块(5块)", kcal: 550, protein: 32.0, carbs: 40.0, fat: 28.0, category: "菜肴", portion: "1份", warn: true },
    { name: "烤鱼", kcal: 260, protein: 30.0, carbs: 6.0, fat: 14.0, category: "菜肴", portion: "约300g" },
    { name: "蛋炒饭", kcal: 420, protein: 15.0, carbs: 60.0, fat: 12.0, category: "菜肴", portion: "1盘" },
    { name: "麻辣香锅", kcal: 550, protein: 30.0, carbs: 35.0, fat: 32.0, category: "菜肴", portion: "1份", warn: true },
    { name: "三文鱼牛油果沙拉", kcal: 420, protein: 28.0, carbs: 18.0, fat: 28.0, category: "菜肴", portion: "约350g" },
    { name: "杂粮碗", kcal: 480, protein: 25.0, carbs: 65.0, fat: 12.0, category: "菜肴", portion: "1碗" },
    { name: "三明治", kcal: 380, protein: 18.0, carbs: 42.0, fat: 14.0, category: "菜肴", portion: "1份" },
    { name: "披萨(2块)", kcal: 560, protein: 24.0, carbs: 62.0, fat: 22.0, category: "菜肴", portion: "2块", warn: true },
    { name: "奶茶(大杯)", kcal: 420, protein: 8.0, carbs: 68.0, fat: 13.0, category: "饮料", portion: "大杯", warn: true },
    { name: "可乐(听装)", kcal: 140, protein: 0, carbs: 35.0, fat: 0, category: "饮料", portion: "330ml", warn: true },
  ],
};

// 饮食模式 → 排除规则
const DIET_PREFERENCE_RULES = {
  vegetarian: (food) => food.category !== "蛋白" || food.name.includes("豆腐") || food.name.includes("酸奶") || food.name.includes("牛奶") || food.name.includes("蛋白"),
  "no-seafood": (food) => !food.name.includes("鱼") && !food.name.includes("虾") && !food.name.includes("三文鱼"),
  "no-dairy": (food) => !food.name.includes("牛奶") && !food.name.includes("酸奶"),
  "no-gluten": (food) => !food.name.includes("面") && !food.name.includes("面包") && !food.name.includes("馒头"),
};
