package routes

import (
	"net/http"
	"ninimenu/internal/config"
	"ninimenu/internal/handlers"
	"ninimenu/internal/middleware"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
)

func Setup(r *gin.Engine) {
	r.MaxMultipartMemory = config.C.MaxUploadSize + 1<<20
	r.Use(middleware.CORSMiddleware())
	r.Use(middleware.LoggerMiddleware())

	uploadDir := config.C.UploadDir
	if absDir, err := filepath.Abs(uploadDir); err == nil {
		uploads := r.Group("/uploads")
		uploads.Use(func(c *gin.Context) {
			c.Header("Cache-Control", "public, max-age=86400, immutable")
		})
		uploads.StaticFS("/", http.Dir(absDir))
	}

	api := r.Group("/api")
	{
		api.POST("/app/login", handlers.AppLogin)
		api.POST("/admin/login", handlers.Login)
		api.GET("/app-info", handlers.GetAppInfo)

		app := api.Group("")
		app.Use(middleware.AppAuthMiddleware())
		{
			app.GET("/dishes", handlers.GetDishes)
			app.GET("/dishes/category-counts", handlers.GetDishCategoryCounts)
			app.GET("/dishes/:id", handlers.GetDish)
			app.GET("/dishes/:id/records", handlers.GetDishRecords)
			app.GET("/records", handlers.GetRecords)
			app.POST("/records", handlers.CreateRecord)
			app.POST("/records/batch", handlers.BatchCreateRecords)
			app.PUT("/records/:id", handlers.UpdateRecord)
			app.DELETE("/records/:id", handlers.DeleteRecord)
			app.GET("/favorites", handlers.GetFavorites)
			app.GET("/favorites/overview", handlers.GetFavoritesOverview)
			app.POST("/favorites/:dishId", handlers.AddFavorite)
			app.DELETE("/favorites/:dishId", handlers.RemoveFavorite)
			app.POST("/pick/lunch", handlers.PickLunch)
			app.POST("/pick/dinner", handlers.PickDinner)
			app.POST("/pick/mood", handlers.PickMood)
			app.POST("/pick/tomorrow", handlers.PickTomorrow)
			app.POST("/pick/blind-box", handlers.PickBlindBox)
			app.GET("/quotes", handlers.GetQuotes)
			app.GET("/achievements", handlers.GetAchievements)
			app.POST("/achievements/:id/unlock", handlers.UnlockAchievement)
			app.POST("/achievements/:id/toggle", handlers.ToggleAchievement)
			app.GET("/stats", handlers.GetStats)
			app.GET("/day-rating", handlers.GetDayRating)
			app.GET("/day-ratings", handlers.GetDayRatings)
			app.POST("/day-rating/home-mood", handlers.CreateOrUpdateHomeMood)
			app.POST("/day-rating", handlers.CreateOrUpdateDayRating)
			app.GET("/photo-wall", handlers.GetPhotoWall)
			app.GET("/settings", handlers.GetSettings)
			app.GET("/week-plan", handlers.GetWeekPlan)
			app.POST("/week-plan/regenerate", handlers.RegenerateWeekPlanHandler)
			app.GET("/shopping-list", handlers.GetShoppingList)
			app.POST("/shopping-list/toggle", handlers.ToggleShoppingCheckHandler)
			app.POST("/shopping-list/inventory", handlers.ToggleHomeInventoryHandler)
			app.GET("/holidays/upcoming", handlers.GetUpcomingHolidays)
		}
	}

	admin := api.Group("")
	admin.Use(middleware.AuthMiddleware())
	{
		admin.POST("/dishes/batch-toggle", handlers.BatchToggleDishes)
		admin.POST("/dishes/batch-delete", handlers.BatchDeleteDishes)
		admin.POST("/dishes/batch-category", handlers.BatchUpdateCategory)
		admin.POST("/dishes", handlers.CreateDish)
		admin.PUT("/dishes/:id", handlers.UpdateDish)
		admin.DELETE("/dishes/:id", handlers.DeleteDish)
		admin.PUT("/dishes/:id/toggle", handlers.ToggleDish)
		admin.POST("/dishes/:id/clone", handlers.CloneDish)
		admin.POST("/upload/image", handlers.UploadImage)
		admin.DELETE("/upload/image", handlers.DeleteImage)
		admin.POST("/quotes", handlers.CreateQuote)
		admin.PUT("/quotes/:id", handlers.UpdateQuote)
		admin.DELETE("/quotes/:id", handlers.DeleteQuote)
		admin.GET("/shopping-categories", handlers.GetShoppingCategories)
		admin.POST("/shopping-categories", handlers.UpsertShoppingCategoryHandler)
		admin.DELETE("/shopping-categories/:itemName", handlers.DeleteShoppingCategoryHandler)
		admin.PUT("/settings", handlers.UpdateSettings)
		admin.POST("/achievements", handlers.CreateAchievement)
		admin.PUT("/achievements/:id", handlers.UpdateAchievement)
		admin.DELETE("/achievements/:id", handlers.DeleteAchievement)
		admin.GET("/admin/dashboard", handlers.GetDashboard)
	}

	staticDir := "static"
	if info, err := os.Stat(staticDir); err == nil && info.IsDir() {
		r.NoRoute(func(c *gin.Context) {
			path := filepath.Join(staticDir, c.Request.URL.Path)
			if _, err := os.Stat(path); err == nil {
				c.File(path)
				return
			}
			c.File(filepath.Join(staticDir, "index.html"))
		})
	}
}
