package client

import (
	"context"
	"net/http"
)

// ListBrowsers calls GET /api/v1/browsers.
func (c *Client) ListBrowsers(ctx context.Context) (*ListBrowsersResponse, error) {
	var res ListBrowsersResponse
	if err := c.doJSON(ctx, http.MethodGet, "/browsers", nil, nil, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// CreateBrowser calls POST /api/v1/browsers.
func (c *Client) CreateBrowser(ctx context.Context, req CreateBrowserRequest) (*CreateBrowserResponse, error) {
	var res CreateBrowserResponse
	if err := c.doJSON(ctx, http.MethodPost, "/browsers", nil, req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}
