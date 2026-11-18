package client

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"regexp"
	"strings"
)

var createdPageIDPattern = regexp.MustCompile(`id:"([^"]+)"`)

func browserQuery(browserID string) url.Values {
	q := url.Values{}
	q.Set("browserId", browserID)
	return q
}

// ListPages calls GET /api/v1/browsers/pages?browserId=<id>.
func (c *Client) ListPages(ctx context.Context, browserID string) (*ListPagesResponse, error) {
	var res ListPagesResponse
	if err := c.doJSON(ctx, http.MethodGet, "/browsers/pages", browserQuery(browserID), nil, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// CreatePage calls POST /api/v1/browsers/pages.
func (c *Client) CreatePage(ctx context.Context, req CreatePageRequest) (*CreatePageResponse, error) {
	raw, err := c.doRaw(ctx, http.MethodPost, "/browsers/pages", nil, req)
	if err != nil {
		return nil, err
	}

	res := &CreatePageResponse{
		BrowserID: req.BrowserID,
	}

	// Support JSON response if the server returns it, otherwise parse plain text.
	if err := json.Unmarshal(raw, res); err == nil && res.PageID != "" {
		return res, nil
	}

	msg := strings.TrimSpace(string(raw))
	res.Message = msg
	if matches := createdPageIDPattern.FindStringSubmatch(msg); len(matches) == 2 {
		res.PageID = matches[1]
	}
	return res, nil
}

// GetPage calls GET /api/v1/browsers/pages/:id?browserId=<id>.
func (c *Client) GetPage(ctx context.Context, browserID, pageID string) (*PageDetail, error) {
	var res PageDetail
	path := "/browsers/pages/" + url.PathEscape(pageID)
	if err := c.doJSON(ctx, http.MethodGet, path, browserQuery(browserID), nil, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// UpdatePage calls PATCH /api/v1/browsers/pages/:id.
func (c *Client) UpdatePage(ctx context.Context, pageID string, req UpdatePageRequest) (*PageDetail, error) {
	var res PageDetail
	path := "/browsers/pages/" + url.PathEscape(pageID)
	if err := c.doJSON(ctx, http.MethodPatch, path, nil, req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// DeletePage calls DELETE /api/v1/browsers/pages/:id?browserId=<id>.
func (c *Client) DeletePage(ctx context.Context, browserID, pageID string) (*DeletePageResponse, error) {
	var res DeletePageResponse
	path := "/browsers/pages/" + url.PathEscape(pageID)
	if err := c.doJSON(ctx, http.MethodDelete, path, browserQuery(browserID), nil, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// SnapshotPage calls GET /api/v1/browsers/pages/:id/snapshot?browserId=<id>.
func (c *Client) SnapshotPage(ctx context.Context, browserID, pageID string) (*PageSnapshotResponse, error) {
	var res PageSnapshotResponse
	path := "/browsers/pages/" + url.PathEscape(pageID) + "/snapshot"
	if err := c.doJSON(ctx, http.MethodGet, path, browserQuery(browserID), nil, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// ClickPage calls POST /api/v1/browsers/pages/:id/click.
func (c *Client) ClickPage(ctx context.Context, pageID string, req ClickPageRequest) (*ClickPageResponse, error) {
	var res ClickPageResponse
	path := "/browsers/pages/" + url.PathEscape(pageID) + "/click"
	if err := c.doJSON(ctx, http.MethodPost, path, nil, req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// GetPageScroll calls GET /api/v1/browsers/pages/:id/scroll?browserId=<id>.
func (c *Client) GetPageScroll(ctx context.Context, browserID, pageID string) (*PageScrollInfoResponse, error) {
	var res PageScrollInfoResponse
	path := "/browsers/pages/" + url.PathEscape(pageID) + "/scroll"
	if err := c.doJSON(ctx, http.MethodGet, path, browserQuery(browserID), nil, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// ScrollPage calls POST /api/v1/browsers/pages/:id/scroll.
func (c *Client) ScrollPage(ctx context.Context, pageID string, req ScrollPageRequest) (*ScrollPageResponse, error) {
	var res ScrollPageResponse
	path := "/browsers/pages/" + url.PathEscape(pageID) + "/scroll"
	if err := c.doJSON(ctx, http.MethodPost, path, nil, req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}
