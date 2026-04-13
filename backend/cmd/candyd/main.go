package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"candy/backend/internal/candy"
)

func main() {
	cfg := candy.LoadConfig()
	app, err := candy.NewApp(cfg)
	if err != nil {
		log.Fatalf("start app: %v", err)
	}
	defer app.Close()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	app.StartWorkers(ctx)

	server := &http.Server{
		Addr:              cfg.Addr,
		Handler:           app.Routes(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("candy-sweet delivery server listening on %s", cfg.Addr)
		if cfg.UsingDevSecret {
			log.Printf("warning: CANDY_APP_SECRET is not set; using an insecure development secret")
		}
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("http server: %v", err)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown: %v", err)
	}
}
