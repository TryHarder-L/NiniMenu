package handlers

import (
	"ninimenu/internal/database"
	"ninimenu/internal/models"
	"ninimenu/internal/services"
	"ninimenu/internal/utils"
	"sort"
	"time"

	"github.com/gin-gonic/gin"
)

type favoriteDishEntry struct {
	Favorite models.Favorite
	Dish     models.Dish
}

func loadFavoriteDishEntries() ([]favoriteDishEntry, error) {
	var favorites []models.Favorite
	if err := database.DB.Order("created_at DESC").Find(&favorites).Error; err != nil {
		return nil, err
	}

	if len(favorites) == 0 {
		return []favoriteDishEntry{}, nil
	}

	dishIDs := make([]uint, 0, len(favorites))
	for _, f := range favorites {
		dishIDs = append(dishIDs, f.DishID)
	}

	var dishes []models.Dish
	if err := database.DB.Where("id IN ?", dishIDs).Find(&dishes).Error; err != nil {
		return nil, err
	}

	dishByID := make(map[uint]models.Dish, len(dishes))
	for _, d := range dishes {
		dishByID[d.ID] = d
	}

	entries := make([]favoriteDishEntry, 0, len(favorites))
	for _, f := range favorites {
		if dish, ok := dishByID[f.DishID]; ok {
			entries = append(entries, favoriteDishEntry{
				Favorite: f,
				Dish:     dish,
			})
		}
	}

	return entries, nil
}

func GetFavorites(c *gin.Context) {
	entries, err := loadFavoriteDishEntries()
	if err != nil {
		utils.InternalError(c, "获取收藏失败")
		return
	}

	dishes := make([]models.Dish, 0, len(entries))
	for _, entry := range entries {
		dishes = append(dishes, entry.Dish)
	}

	utils.Success(c, dishes)
}

type FavoriteRecordStats struct {
	DishID      uint    `json:"dish_id"`
	RecordCount int     `json:"record_count"`
	LunchCount  int     `json:"lunch_count"`
	DinnerCount int     `json:"dinner_count"`
	LastEatenAt string  `json:"last_eaten_at"`
	AvgRating   float64 `json:"avg_rating"`
}

type FavoriteOverviewItem struct {
	Dish              models.Dish `json:"dish"`
	FavoriteCreatedAt time.Time   `json:"favorite_created_at"`
	RecordCount       int         `json:"record_count"`
	LunchCount        int         `json:"lunch_count"`
	DinnerCount       int         `json:"dinner_count"`
	LastEatenAt       string      `json:"last_eaten_at"`
	AvgRating         float64     `json:"avg_rating"`
	IsNeverCooked     bool        `json:"is_never_cooked"`
}

type FavoriteCategorySummary struct {
	Category         string `json:"category"`
	Count            int    `json:"count"`
	AvgCookTime      int    `json:"avg_cook_time"`
	CookedCount      int    `json:"cooked_count"`
	NeverCookedCount int    `json:"never_cooked_count"`
	QuickDishID      uint   `json:"quick_dish_id"`
	QuickDishName    string `json:"quick_dish_name"`
}

type FavoriteOverviewStats struct {
	Total            int          `json:"total"`
	CategoryTotal    int          `json:"category_total"`
	AvgCookTime      int          `json:"avg_cook_time"`
	CookedCount      int          `json:"cooked_count"`
	NeverCookedCount int          `json:"never_cooked_count"`
	QuickDish        *models.Dish `json:"quick_dish"`
	MostCookedDish   *models.Dish `json:"most_cooked_dish"`
}

type FavoriteOverview struct {
	Items      []FavoriteOverviewItem    `json:"items"`
	Categories []FavoriteCategorySummary `json:"categories"`
	Stats      FavoriteOverviewStats     `json:"stats"`
	QuickPicks []FavoriteOverviewItem    `json:"quick_picks"`
	MostCooked []FavoriteOverviewItem    `json:"most_cooked"`
	NeedTry    []FavoriteOverviewItem    `json:"need_try"`
}

func loadFavoriteRecordStats(dishIDs []uint) (map[uint]FavoriteRecordStats, error) {
	statsByDish := make(map[uint]FavoriteRecordStats, len(dishIDs))
	if len(dishIDs) == 0 {
		return statsByDish, nil
	}

	var rows []FavoriteRecordStats
	err := database.DB.Model(&models.MealRecord{}).
		Select(`
			dish_id,
			count(*) as record_count,
			sum(case when meal_type = 'lunch' then 1 else 0 end) as lunch_count,
			sum(case when meal_type = 'dinner' then 1 else 0 end) as dinner_count,
			max(meal_date) as last_eaten_at,
			coalesce(avg(case when rating > 0 then rating end), 0) as avg_rating
		`).
		Where("dish_id IN ?", dishIDs).
		Group("dish_id").
		Find(&rows).Error
	if err != nil {
		return nil, err
	}

	for _, row := range rows {
		statsByDish[row.DishID] = row
	}
	return statsByDish, nil
}

func GetFavoritesOverview(c *gin.Context) {
	entries, err := loadFavoriteDishEntries()
	if err != nil {
		utils.InternalError(c, "获取收藏概览失败")
		return
	}

	dishIDs := make([]uint, 0, len(entries))
	for _, entry := range entries {
		dishIDs = append(dishIDs, entry.Dish.ID)
	}

	recordStats, err := loadFavoriteRecordStats(dishIDs)
	if err != nil {
		utils.InternalError(c, "获取收藏记录失败")
		return
	}

	items := make([]FavoriteOverviewItem, 0, len(entries))
	totalCookTime := 0
	cookedCount := 0
	neverCookedCount := 0
	var quickDish *models.Dish
	var mostCookedDish *models.Dish

	type categoryAgg struct {
		summary       FavoriteCategorySummary
		totalCookTime int
		quickCookTime int
	}
	categoryMap := make(map[string]*categoryAgg)

	for i := range entries {
		entry := entries[i]
		dish := entry.Dish
		stat := recordStats[dish.ID]
		item := FavoriteOverviewItem{
			Dish:              dish,
			FavoriteCreatedAt: entry.Favorite.CreatedAt,
			RecordCount:       stat.RecordCount,
			LunchCount:        stat.LunchCount,
			DinnerCount:       stat.DinnerCount,
			LastEatenAt:       stat.LastEatenAt,
			AvgRating:         stat.AvgRating,
			IsNeverCooked:     stat.RecordCount == 0,
		}
		items = append(items, item)

		totalCookTime += max(dish.CookTime, 0)
		if stat.RecordCount > 0 {
			cookedCount++
		} else {
			neverCookedCount++
		}

		if quickDish == nil || normalizedCookTime(dish.CookTime) < normalizedCookTime(quickDish.CookTime) {
			quickDish = &entries[i].Dish
		}
		if stat.RecordCount > 0 && (mostCookedDish == nil || stat.RecordCount > recordStats[mostCookedDish.ID].RecordCount) {
			mostCookedDish = &entries[i].Dish
		}

		category := dish.Category
		if category == "" {
			category = "其他"
		}
		agg := categoryMap[category]
		if agg == nil {
			agg = &categoryAgg{
				summary: FavoriteCategorySummary{
					Category:      category,
					QuickDishID:   dish.ID,
					QuickDishName: dish.Name,
				},
				quickCookTime: normalizedCookTime(dish.CookTime),
			}
			categoryMap[category] = agg
		}
		agg.summary.Count++
		agg.totalCookTime += max(dish.CookTime, 0)
		if stat.RecordCount > 0 {
			agg.summary.CookedCount++
		} else {
			agg.summary.NeverCookedCount++
		}
		if normalizedCookTime(dish.CookTime) < agg.quickCookTime {
			agg.quickCookTime = normalizedCookTime(dish.CookTime)
			agg.summary.QuickDishID = dish.ID
			agg.summary.QuickDishName = dish.Name
		}
	}

	categories := make([]FavoriteCategorySummary, 0, len(categoryMap))
	for _, agg := range categoryMap {
		if agg.summary.Count > 0 {
			agg.summary.AvgCookTime = agg.totalCookTime / agg.summary.Count
		}
		categories = append(categories, agg.summary)
	}
	sort.Slice(categories, func(i, j int) bool {
		if categories[i].Count == categories[j].Count {
			return categories[i].Category < categories[j].Category
		}
		return categories[i].Count > categories[j].Count
	})

	avgCookTime := 0
	if len(entries) > 0 {
		avgCookTime = totalCookTime / len(entries)
	}

	utils.Success(c, FavoriteOverview{
		Items:      items,
		Categories: categories,
		Stats: FavoriteOverviewStats{
			Total:            len(entries),
			CategoryTotal:    len(categories),
			AvgCookTime:      avgCookTime,
			CookedCount:      cookedCount,
			NeverCookedCount: neverCookedCount,
			QuickDish:        quickDish,
			MostCookedDish:   mostCookedDish,
		},
		QuickPicks: buildQuickPicks(items),
		MostCooked: buildMostCooked(items),
		NeedTry:    buildNeedTry(items),
	})
}

func normalizedCookTime(cookTime int) int {
	if cookTime <= 0 {
		return 9999
	}
	return cookTime
}

func buildQuickPicks(items []FavoriteOverviewItem) []FavoriteOverviewItem {
	picks := append([]FavoriteOverviewItem{}, items...)
	sort.Slice(picks, func(i, j int) bool {
		left := normalizedCookTime(picks[i].Dish.CookTime)
		right := normalizedCookTime(picks[j].Dish.CookTime)
		if left == right {
			return picks[i].FavoriteCreatedAt.After(picks[j].FavoriteCreatedAt)
		}
		return left < right
	})
	return limitFavoriteItems(picks, 10)
}

func buildMostCooked(items []FavoriteOverviewItem) []FavoriteOverviewItem {
	picks := make([]FavoriteOverviewItem, 0, len(items))
	for _, item := range items {
		if item.RecordCount > 0 {
			picks = append(picks, item)
		}
	}
	sort.Slice(picks, func(i, j int) bool {
		if picks[i].RecordCount == picks[j].RecordCount {
			return picks[i].LastEatenAt > picks[j].LastEatenAt
		}
		return picks[i].RecordCount > picks[j].RecordCount
	})
	return limitFavoriteItems(picks, 10)
}

func buildNeedTry(items []FavoriteOverviewItem) []FavoriteOverviewItem {
	picks := make([]FavoriteOverviewItem, 0, len(items))
	for _, item := range items {
		if item.RecordCount == 0 {
			picks = append(picks, item)
		}
	}
	sort.Slice(picks, func(i, j int) bool {
		return picks[i].FavoriteCreatedAt.Before(picks[j].FavoriteCreatedAt)
	})
	return limitFavoriteItems(picks, 10)
}

func limitFavoriteItems(items []FavoriteOverviewItem, limit int) []FavoriteOverviewItem {
	if len(items) == 0 {
		return []FavoriteOverviewItem{}
	}
	if len(items) > limit {
		return items[:limit]
	}
	return items
}

func AddFavorite(c *gin.Context) {
	dishID := c.Param("dishId")
	var dish models.Dish
	if err := database.DB.First(&dish, dishID).Error; err != nil {
		utils.NotFound(c, "菜品不存在")
		return
	}

	var existing models.Favorite
	if err := database.DB.Where("dish_id = ?", dish.ID).First(&existing).Error; err == nil {
		utils.SuccessMsg(c, "已收藏")
		return
	}

	fav := models.Favorite{DishID: dish.ID}
	database.DB.Create(&fav)
	database.DB.Model(&dish).Update("favorite", true)
	services.QueueAutoAchievementSync()

	utils.SuccessMsg(c, "收藏成功")
}

func RemoveFavorite(c *gin.Context) {
	dishID := c.Param("dishId")

	database.DB.Where("dish_id = ?", dishID).Delete(&models.Favorite{})
	database.DB.Model(&models.Dish{}).Where("id = ?", dishID).Update("favorite", false)
	services.QueueAutoAchievementSync()

	utils.SuccessMsg(c, "取消收藏成功")
}
