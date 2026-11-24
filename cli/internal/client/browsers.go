package client

import (
	"context"
	"net/http"
	"net/url"
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

// DeleteBrowser calls DELETE /api/v1/browsers/:id.
func (c *Client) DeleteBrowser(ctx context.Context, browserID string) (*DeleteBrowserResponse, error) {
	var res DeleteBrowserResponse
	path := "/browsers/" + url.PathEscape(browserID)
	if err := c.doJSON(ctx, http.MethodDelete, path, nil, nil, &res); err != nil {
		return nil, err
	}
	return &res, nil
}
