package config

import (
	"time"

	"github.com/Brykl/agentic_browser/cli/internal/client"
)

// Options holds global CLI configuration shared across commands.
type Options struct {
	BaseURL   string
	Timeout   time.Duration
	JSON      bool
	StateFile string
}

// NewClient constructs a thin API client using the configured options.
func (o *Options) NewClient() *client.Client {
	return client.New(o.BaseURL, client.WithTimeout(o.Timeout))
}
