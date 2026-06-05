package services

import (
	"encoding/json"
	"math"
	"math/rand"
	"ninimenu/internal/database"
	"ninimenu/internal/models"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type WeekDayPlan struct {
	Date    string        `json:"date"`
	DayName string        `json:"day_name"`
	Lunch   []models.Dish `json:"lunch"`
	Dinner  []models.Dish `json:"dinner"`
}

type WeekPlan struct {
	Days []WeekDayPlan `json:"days"`
}

var (
	cachedPlan    *WeekPlan
	cachedWeekKey string
	planMu        sync.RWMutex
)

func getCurrentWeekKey() string {
	now := time.Now()
	weekday := int(now.Weekday())
	if weekday == 0 {
		weekday = 7
	}
	monday := now.AddDate(0, 0, 1-weekday)
	return monday.Format("2006-01-02")
}

func getSettingInt(key string, defaultVal int) int {
	var setting models.Setting
	if err := database.DB.Where("`key` = ?", key).First(&setting).Error; err == nil {
		if n, err := strconv.Atoi(setting.Value); err == nil && n > 0 {
			return n
		}
	}
	return defaultVal
}

func GetCachedWeekPlan() *WeekPlan {
	weekKey := getCurrentWeekKey()

	planMu.RLock()
	if cachedPlan != nil && cachedWeekKey == weekKey {
		p := cachedPlan
		planMu.RUnlock()
		return p
	}
	planMu.RUnlock()

	var setting models.Setting
	if err := database.DB.Where("`key` = ?", "week_plan_cache").First(&setting).Error; err == nil && setting.Value != "" {
		var plan WeekPlan
		if json.Unmarshal([]byte(setting.Value), &plan) == nil && len(plan.Days) > 0 {
			if plan.Days[0].Date >= weekKey {
				planMu.Lock()
				cachedPlan = &plan
				cachedWeekKey = weekKey
				planMu.Unlock()
				return &plan
			}
		}
	}

	plan, _ := GenerateWeekPlan()
	saveWeekPlanCache(plan)
	return plan
}

func RegenerateWeekPlan() *WeekPlan {
	plan, _ := GenerateWeekPlan()
	saveWeekPlanCache(plan)
	return plan
}

func saveWeekPlanCache(plan *WeekPlan) {
	data, _ := json.Marshal(plan)
	database.DB.Model(&models.Setting{}).Where("`key` = ?", "week_plan_cache").Assign(models.Setting{Key: "week_plan_cache", Value: string(data)}).FirstOrCreate(&models.Setting{})
	planMu.Lock()
	cachedPlan = plan
	cachedWeekKey = getCurrentWeekKey()
	planMu.Unlock()
}

func GenerateWeekPlan() (*WeekPlan, error) {
	var dishes []models.Dish
	database.DB.Where("enabled = ?", true).Find(&dishes)
	if len(dishes) == 0 {
		return &WeekPlan{}, nil
	}

	lunchCount := getSettingInt("lunch_dishes_per_day", 1)
	dinnerCount := getSettingInt("dinner_dishes_per_day", 1)

	var lunchPool, dinnerPool []models.Dish
	for _, d := range dishes {
		tags := parseTags(d.Tags)
		mt := d.MealType
		if mt == "all" || mt == "lunch" || containsTag(tags, "午餐") || containsTag(tags, "lunch") {
			lunchPool = append(lunchPool, d)
		}
		if mt == "all" || mt == "dinner" || containsTag(tags, "晚餐") || containsTag(tags, "dinner") {
			dinnerPool = append(dinnerPool, d)
		}
	}
	if len(lunchPool) == 0 {
		lunchPool = dishes
	}
	if len(dinnerPool) == 0 {
		dinnerPool = dishes
	}

	dayNames := []string{"周一", "周二", "周三", "周四", "周五", "周六", "周日"}
	now := time.Now()
	weekday := int(now.Weekday())
	if weekday == 0 {
		weekday = 7
	}
	monday := now.AddDate(0, 0, 1-weekday)

	r := rand.New(rand.NewSource(time.Now().UnixNano()))

	var days []WeekDayPlan
	usedAllIDs := make(map[uint]bool)

	for i := 0; i < 7; i++ {
		date := monday.AddDate(0, 0, i)
		dayPlan := WeekDayPlan{
			Date:    date.Format("2006-01-02"),
			DayName: dayNames[i],
		}

		usedThisDay := make(map[uint]bool)

		dayPlan.Lunch = pickNDishes(lunchPool, lunchCount, usedAllIDs, usedThisDay, r)
		dayPlan.Dinner = pickNDishes(dinnerPool, dinnerCount, usedAllIDs, usedThisDay, r)

		days = append(days, dayPlan)
	}

	return &WeekPlan{Days: days}, nil
}

func pickNDishes(pool []models.Dish, count int, globalUsed map[uint]bool, dayUsed map[uint]bool, r *rand.Rand) []models.Dish {
	available := filterAvailableBoth(pool, globalUsed, dayUsed)
	var picked []models.Dish

	for len(picked) < count && len(available) > 0 {
		idx := r.Intn(len(available))
		d := available[idx]
		picked = append(picked, d)
		globalUsed[d.ID] = true
		dayUsed[d.ID] = true
		available = filterAvailableBoth(pool, globalUsed, dayUsed)
	}

	if len(picked) < count {
		available2 := filterAvailable(pool, dayUsed)
		for len(picked) < count && len(available2) > 0 {
			idx := r.Intn(len(available2))
			d := available2[idx]
			picked = append(picked, d)
			dayUsed[d.ID] = true
			available2 = filterAvailable(pool, dayUsed)
		}
	}

	return picked
}

func filterAvailableBoth(dishes []models.Dish, globalUsed map[uint]bool, dayUsed map[uint]bool) []models.Dish {
	var result []models.Dish
	for _, d := range dishes {
		if !globalUsed[d.ID] && !dayUsed[d.ID] {
			result = append(result, d)
		}
	}
	if len(result) == 0 {
		for _, d := range dishes {
			if !dayUsed[d.ID] {
				result = append(result, d)
			}
		}
	}
	return result
}

func filterAvailable(dishes []models.Dish, used map[uint]bool) []models.Dish {
	var result []models.Dish
	for _, d := range dishes {
		if !used[d.ID] {
			result = append(result, d)
		}
	}
	return result
}

func parseTags(tagsStr string) []string {
	var tags []string
	json.Unmarshal([]byte(tagsStr), &tags)
	return tags
}

func containsTag(tags []string, target string) bool {
	for _, t := range tags {
		if strings.EqualFold(t, target) {
			return true
		}
	}
	return false
}

type ShoppingCategory struct {
	Category string         `json:"category"`
	Items    []ShoppingItem `json:"items"`
}

type ShoppingItem struct {
	Name    string `json:"name"`
	Amount  string `json:"amount"`
	Checked bool   `json:"checked"`
	InStock bool   `json:"in_stock"`
}

type ShoppingCategoryOverride struct {
	ItemName string `json:"item_name"`
	Category string `json:"category"`
}

var shoppingCategoryOrder = map[string]int{
	"蔬菜": 0,
	"肉类": 1,
	"配料": 2,
	"其他": 3,
}

var shoppingCategoryExactTerms = map[string][]string{
	"蔬菜": {
		"番茄", "西红柿", "圣女果", "小番茄",
		"西兰花", "花菜", "菜花", "包菜", "卷心菜", "娃娃菜",
		"白菜", "大白菜", "小白菜", "青菜", "油菜", "油麦菜", "生菜",
		"菠菜", "空心菜", "苋菜", "茼蒿", "芹菜", "香菜", "韭菜",
		"葱", "小葱", "大葱", "葱花", "姜", "姜片", "姜丝",
		"蒜", "大蒜", "蒜瓣", "蒜末", "蒜苗", "蒜苔", "洋葱",
		"土豆", "马铃薯", "红薯", "地瓜", "山药", "芋头", "莲藕",
		"萝卜", "白萝卜", "胡萝卜", "莴笋", "竹笋", "冬笋", "春笋",
		"黄瓜", "丝瓜", "冬瓜", "南瓜", "苦瓜", "西葫芦", "茄子",
		"青椒", "红椒", "彩椒", "甜椒", "尖椒", "线椒", "小米辣",
		"蘑菇", "香菇", "平菇", "金针菇", "杏鲍菇", "口蘑", "蟹味菇",
		"木耳", "银耳", "海带", "紫菜", "裙带菜",
		"豆腐", "嫩豆腐", "老豆腐", "内酯豆腐", "油豆腐", "豆皮", "千张",
		"腐竹", "豆芽", "黄豆芽", "绿豆芽", "毛豆", "豌豆", "荷兰豆",
		"四季豆", "豆角", "豇豆", "玉米",
	},
	"肉类": {
		"猪肉", "猪肉末", "肉末", "肉丝", "肉片", "五花肉", "里脊肉",
		"排骨", "猪蹄", "猪肝", "猪肚", "腊肉", "火腿", "香肠", "午餐肉",
		"牛肉", "牛腩", "牛排", "肥牛", "牛肉丸",
		"羊肉", "羊排", "鸡肉", "鸡腿", "鸡翅", "鸡胸肉", "鸡爪",
		"鸭肉", "鸭腿", "鸭血", "鹅肉",
		"鸡蛋", "蛋液", "蛋清", "蛋白", "蛋黄", "鸭蛋", "鹌鹑蛋", "皮蛋", "咸鸭蛋",
		"鱼", "鱼片", "鲈鱼", "鲫鱼", "草鱼", "带鱼", "三文鱼", "鳕鱼",
		"虾", "虾仁", "基围虾", "明虾", "虾滑", "蟹", "螃蟹", "蟹棒",
		"蛤蜊", "花甲", "扇贝", "干贝", "鱿鱼", "墨鱼", "章鱼",
	},
	"配料": {
		"盐", "食盐", "糖", "白糖", "冰糖", "红糖", "蜂蜜",
		"生抽", "老抽", "酱油", "蚝油", "醋", "陈醋", "白醋", "米醋",
		"料酒", "黄酒", "白酒", "啤酒", "味淋",
		"油", "食用油", "花生油", "玉米油", "菜籽油", "橄榄油", "香油", "麻油", "辣椒油",
		"豆瓣酱", "郫县豆瓣酱", "黄豆酱", "甜面酱", "番茄酱", "沙茶酱", "芝麻酱",
		"辣椒酱", "蒜蓉辣酱", "剁椒酱", "老干妈", "火锅底料",
		"淀粉", "玉米淀粉", "土豆淀粉", "红薯淀粉", "生粉",
		"花椒", "花椒粉", "胡椒", "胡椒粉", "白胡椒粉", "黑胡椒", "黑胡椒粉",
		"辣椒粉", "五香粉", "孜然", "孜然粉", "椒盐", "十三香", "咖喱", "咖喱块", "咖喱粉",
		"八角", "桂皮", "香叶", "小茴香", "草果", "丁香", "豆蔻", "陈皮",
		"鸡精", "味精", "鸡粉", "高汤", "浓汤宝",
		"白芝麻", "黑芝麻", "芝麻", "豆豉", "腐乳", "虾皮", "海米", "鱼露", "蛋黄酱",
	},
	"其他": {
		"大米", "米", "糯米", "小米", "黑米", "燕麦", "面粉", "低筋面粉", "高筋面粉", "糯米粉",
		"面条", "挂面", "意面", "鸡蛋面", "方便面", "泡面", "粉丝", "粉条", "米粉", "河粉", "宽粉", "红薯粉", "土豆粉",
		"年糕", "馒头", "面包", "吐司", "饺子皮", "馄饨皮",
		"牛奶", "淡奶油", "黄油", "芝士", "奶酪", "可乐", "雪碧",
		"花生", "花生米", "腰果", "核桃", "杏仁", "葡萄干",
	},
}

var shoppingCategoryExact = buildShoppingCategoryExact(shoppingCategoryExactTerms)

func buildShoppingCategoryExact(terms map[string][]string) map[string]string {
	result := make(map[string]string)
	for category, names := range terms {
		if !isValidShoppingCategory(category) {
			continue
		}
		for _, name := range names {
			name = strings.TrimSpace(name)
			if name != "" {
				result[name] = category
			}
		}
	}
	return result
}

var amountPattern = regexp.MustCompile(`^([0-9]+(?:\.[0-9]+)?)(.*)$`)

type numericAmountAccum struct {
	total float64
}

func compactShoppingAmounts(amounts []string) string {
	numericByUnit := make(map[string]*numericAmountAccum)
	textSeen := make(map[string]bool)

	for _, amount := range amounts {
		for _, part := range strings.Split(strings.ReplaceAll(amount, "＋", "+"), "+") {
			part = strings.TrimSpace(part)
			if part == "" {
				continue
			}

			if m := amountPattern.FindStringSubmatch(part); m != nil {
				num, err := strconv.ParseFloat(m[1], 64)
				if err == nil {
					unit := strings.TrimSpace(m[2])
					acc, exists := numericByUnit[unit]
					if !exists {
						acc = &numericAmountAccum{}
						numericByUnit[unit] = acc
					}
					acc.total += num
					continue
				}
			}

			if !textSeen[part] {
				textSeen[part] = true
			}
		}
	}

	if len(numericByUnit) == 0 && len(textSeen) == 0 {
		return "适量"
	}

	parts := make([]string, 0, len(textSeen)+len(numericByUnit))
	texts := make([]string, 0, len(textSeen))
	for text := range textSeen {
		texts = append(texts, text)
	}
	sort.Strings(texts)
	parts = append(parts, texts...)

	units := make([]string, 0, len(numericByUnit))
	for unit := range numericByUnit {
		units = append(units, unit)
	}
	sort.Strings(units)
	for _, unit := range units {
		parts = append(parts, formatAmountNumber(numericByUnit[unit].total)+unit)
	}

	if len(parts) == 0 {
		return "适量"
	}
	return strings.Join(parts, "+")
}

func formatAmountNumber(n float64) string {
	rounded := math.Round(n)
	if math.Abs(n-rounded) < 1e-9 {
		return strconv.FormatInt(int64(rounded), 10)
	}
	return strconv.FormatFloat(n, 'f', -1, 64)
}

func sortShoppingItems(items []ShoppingItem) {
	sort.Slice(items, func(i, j int) bool {
		if shoppingItemPriority(items[i]) != shoppingItemPriority(items[j]) {
			return shoppingItemPriority(items[i]) < shoppingItemPriority(items[j])
		}
		if items[i].Name != items[j].Name {
			return items[i].Name < items[j].Name
		}
		if items[i].Amount != items[j].Amount {
			return items[i].Amount < items[j].Amount
		}
		return false
	})
}

func shoppingItemPriority(item ShoppingItem) int {
	switch {
	case item.InStock:
		return 2
	case item.Checked:
		return 1
	default:
		return 0
	}
}

func BuildShoppingList(dates []string) []ShoppingCategory {
	if len(dates) == 0 {
		return []ShoppingCategory{}
	}

	var checks []models.ShoppingCheck
	database.DB.Where("meal_date IN ?", dates).Find(&checks)
	if len(checks) == 0 {
		return []ShoppingCategory{}
	}

	type nameAccum struct {
		amounts []string
		checked bool
	}
	merged := make(map[string]*nameAccum)
	for _, ch := range checks {
		entry, exists := merged[ch.ItemName]
		if !exists {
			entry = &nameAccum{}
			merged[ch.ItemName] = entry
		}
		if ch.ItemAmount != "" {
			entry.amounts = append(entry.amounts, ch.ItemAmount)
		}
		if ch.Checked {
			entry.checked = true
		}
	}

	var inventory []models.HomeInventory
	database.DB.Where("in_stock = ?", true).Find(&inventory)
	inStockByName := make(map[string]bool, len(inventory))
	for _, inv := range inventory {
		inStockByName[inv.ItemName] = true
	}

	categoryByName := getShoppingCategoryOverrideMap()

	grouped := map[string][]ShoppingItem{
		"蔬菜": {},
		"肉类": {},
		"配料": {},
		"其他": {},
	}
	for name, entry := range merged {
		amountStr := compactShoppingAmounts(entry.amounts)
		item := ShoppingItem{Name: name, Amount: amountStr, Checked: entry.checked, InStock: inStockByName[name]}
		category := classifyShoppingItem(name, categoryByName)
		if _, ok := grouped[category]; !ok {
			category = "其他"
		}
		grouped[category] = append(grouped[category], item)
	}

	var result []ShoppingCategory
	categoryNames := []string{"蔬菜", "肉类", "配料", "其他"}
	for _, category := range categoryNames {
		items := grouped[category]
		if len(items) == 0 {
			continue
		}
		sortShoppingItems(items)
		result = append(result, ShoppingCategory{Category: category, Items: items})
	}

	return result
}

func classifyShoppingItem(name string, overrides map[string]string) string {
	if category := overrides[name]; isValidShoppingCategory(category) {
		return category
	}

	normalized := strings.TrimSpace(name)
	if normalized == "" {
		return "其他"
	}

	if category := shoppingCategoryExact[normalized]; isValidShoppingCategory(category) {
		return category
	}

	seasoningKw := []string{
		"盐", "糖", "酱", "油", "醋", "料酒", "生抽", "老抽", "蚝油", "淀粉", "生粉", "粉",
		"八角", "花椒", "胡椒", "孜然", "香叶", "桂皮", "辣椒粉", "豆瓣", "冰糖", "鸡精", "味精",
		"十三香", "五香", "椒盐", "香油", "麻油", "咖喱", "芡", "汁", "底料", "腐乳", "豆豉", "芝麻",
	}
	meatKw := []string{
		"肉", "排骨", "牛腩", "五花", "里脊", "肥牛", "猪蹄", "猪肝", "猪肚", "火腿", "香肠", "午餐肉",
		"鸡腿", "鸡翅", "鸡胸", "鸡爪", "鸭腿", "鸭血", "羊排", "牛排", "鱼片", "虾仁", "虾滑", "蟹",
		"蛤蜊", "花甲", "扇贝", "鱿鱼", "墨鱼", "章鱼",
	}
	vegetableKw := []string{
		"菜", "瓜", "豆", "葱", "姜", "蒜", "椒", "萝卜", "笋", "菇", "木耳", "银耳", "藕", "番茄",
		"西红柿", "西兰花", "土豆", "洋葱", "茄子", "芹菜", "香菜", "韭菜", "菠菜", "紫菜", "海带",
		"豆腐", "豆皮", "豆芽", "冬瓜", "南瓜", "山药", "芋头", "莲藕", "玉米", "菌", "蘑",
	}
	otherKw := []string{
		"米", "面", "粉丝", "粉条", "米粉", "河粉", "宽粉", "年糕", "馒头", "面包", "吐司", "饺子皮",
		"馄饨皮", "牛奶", "奶油", "黄油", "芝士", "奶酪", "可乐", "雪碧", "花生", "腰果", "核桃", "杏仁",
	}

	if hasKeyword(normalized, seasoningKw) {
		return "配料"
	}
	if hasKeyword(normalized, meatKw) {
		return "肉类"
	}
	if hasKeyword(normalized, vegetableKw) {
		return "蔬菜"
	}
	if hasKeyword(normalized, otherKw) {
		return "其他"
	}
	return "其他"
}

func getShoppingCategoryOverrideMap() map[string]string {
	var overrides []models.ShoppingItemCategory
	database.DB.Order("item_name ASC").Find(&overrides)

	result := make(map[string]string, len(overrides))
	for _, override := range overrides {
		if isValidShoppingCategory(override.Category) {
			result[override.ItemName] = override.Category
		}
	}
	return result
}

func isValidShoppingCategory(category string) bool {
	_, ok := shoppingCategoryOrder[category]
	return ok
}

func ListShoppingCategoryOverrides() []ShoppingCategoryOverride {
	var rows []models.ShoppingItemCategory
	database.DB.Order("category ASC, item_name ASC").Find(&rows)

	overrides := make([]ShoppingCategoryOverride, 0, len(rows))
	for _, row := range rows {
		if !isValidShoppingCategory(row.Category) {
			continue
		}
		overrides = append(overrides, ShoppingCategoryOverride{
			ItemName: row.ItemName,
			Category: row.Category,
		})
	}

	sort.SliceStable(overrides, func(i, j int) bool {
		if shoppingCategoryOrder[overrides[i].Category] != shoppingCategoryOrder[overrides[j].Category] {
			return shoppingCategoryOrder[overrides[i].Category] < shoppingCategoryOrder[overrides[j].Category]
		}
		return overrides[i].ItemName < overrides[j].ItemName
	})
	return overrides
}

func UpsertShoppingCategoryOverride(itemName, category string) bool {
	itemName = strings.TrimSpace(itemName)
	category = strings.TrimSpace(category)
	if itemName == "" || !isValidShoppingCategory(category) {
		return false
	}

	database.DB.Where("item_name = ?", itemName).
		Assign(models.ShoppingItemCategory{Category: category}).
		FirstOrCreate(&models.ShoppingItemCategory{ItemName: itemName})
	return true
}

func DeleteShoppingCategoryOverride(itemName string) {
	itemName = strings.TrimSpace(itemName)
	if itemName == "" {
		return
	}
	database.DB.Where("item_name = ?", itemName).Delete(&models.ShoppingItemCategory{})
}

func ToggleShoppingCheck(itemName string, mealDate string, checked bool) {
	database.DB.Model(&models.ShoppingCheck{}).
		Where("item_name = ?", itemName).
		Update("checked", checked)
}

func ToggleHomeInventory(itemName string, inStock bool) {
	itemName = strings.TrimSpace(itemName)
	if itemName == "" {
		return
	}

	if !inStock {
		database.DB.Where("item_name = ?", itemName).Delete(&models.HomeInventory{})
		return
	}

	database.DB.Where("item_name = ?", itemName).
		Assign(models.HomeInventory{InStock: true}).
		FirstOrCreate(&models.HomeInventory{ItemName: itemName})
}

func hasKeyword(s string, keywords []string) bool {
	for _, k := range keywords {
		if strings.Contains(s, k) {
			return true
		}
	}
	return false
}
