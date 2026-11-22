package client

// BrowserInfo represents a browser session returned by GET /api/v1/browsers.
type BrowserInfo struct {
	ID       string   `json:"id"`
	Engine   string   `json:"engine,omitempty"`
	OwnerID  string   `json:"ownerId"`
	LastUsed int64    `json:"lastUsed"`
	PageIDs  []string `json:"pageIds"`
}

// ListBrowsersResponse is the response from GET /api/v1/browsers.
type ListBrowsersResponse struct {
	Browsers []BrowserInfo `json:"browsers"`
}

// CreateBrowserRequest is the payload for POST /api/v1/browsers.
type CreateBrowserRequest struct {
	OwnerID  string `json:"ownerId"`
	Headless *bool  `json:"headless,omitempty"`
	Engine   string `json:"engine,omitempty"`
}

// CreateBrowserResponse is the response from POST /api/v1/browsers.
type CreateBrowserResponse struct {
	BrowserID string `json:"browserId"`
}

// PageSummary represents a page item in GET /api/v1/browsers/pages.
type PageSummary struct {
	PageID string `json:"pageId"`
	URL    string `json:"url"`
}

// ListPagesResponse is the response from GET /api/v1/browsers/pages.
type ListPagesResponse struct {
	BrowserID string        `json:"browserId"`
	Pages     []PageSummary `json:"pages"`
}

// CreatePageRequest is the payload for POST /api/v1/browsers/pages.
type CreatePageRequest struct {
	BrowserID string `json:"browserId"`
	PageURL   string `json:"pageUrl,omitempty"`
}

// CreatePageResponse is the parsed response from POST /api/v1/browsers/pages.
type CreatePageResponse struct {
	BrowserID string `json:"browserId"`
	PageID    string `json:"pageId,omitempty"`
	Message   string `json:"message,omitempty"`
}

// PageDetail is the response from GET and PATCH /api/v1/browsers/pages/:id.
type PageDetail struct {
	BrowserID string `json:"browserId"`
	PageID    string `json:"pageId"`
	URL       string `json:"url"`
	Title     string `json:"title"`
}

// UpdatePageRequest is the payload for PATCH /api/v1/browsers/pages/:id.
type UpdatePageRequest struct {
	BrowserID string `json:"browserId"`
	PageURL   string `json:"pageUrl"`
}

// DeletePageResponse is the response from DELETE /api/v1/browsers/pages/:id.
type DeletePageResponse struct {
	BrowserID string `json:"browserId"`
	PageID    string `json:"pageId"`
	Deleted   bool   `json:"deleted"`
}

// PageSnapshotResponse is the response from GET /api/v1/browsers/pages/:id/snapshot.
type PageSnapshotResponse struct {
	BrowserID string `json:"browserId"`
	PageID    string `json:"pageId"`
	Snapshot  string `json:"snapshot"`
}

// ClickPageRequest is the payload for POST /api/v1/browsers/pages/:id/click.
type ClickPageRequest struct {
	BrowserID string `json:"browserId"`
	Ref       string `json:"ref"`
}

// ClickPageResponse is the response from POST /api/v1/browsers/pages/:id/click.
type ClickPageResponse struct {
	BrowserID string  `json:"browserId"`
	PageID    string  `json:"pageId"`
	Clicked   bool    `json:"clicked"`
	Ref       string  `json:"ref"`
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
}

// FillPageRequest is the payload for POST /api/v1/browsers/pages/:id/fill.
type FillPageRequest struct {
	BrowserID string `json:"browserId"`
	Ref       string `json:"ref"`
	Value     string `json:"value"`
}

// FillPageResponse is the response from POST /api/v1/browsers/pages/:id/fill.
type FillPageResponse struct {
	BrowserID string `json:"browserId"`
	PageID    string `json:"pageId"`
	Filled    bool   `json:"filled"`
	Ref       string `json:"ref"`
	Value     string `json:"value"`
}

// ReloadPageRequest is the payload for POST /api/v1/browsers/pages/:id/reload.
type ReloadPageRequest struct {
	BrowserID string `json:"browserId"`
}

// ReloadPageResponse is the response from POST /api/v1/browsers/pages/:id/reload.
type ReloadPageResponse struct {
	BrowserID string `json:"browserId"`
	PageID    string `json:"pageId"`
	Reloaded  bool   `json:"reloaded"`
}

// PageScrollInfoResponse is the response from GET /api/v1/browsers/pages/:id/scroll.
type PageScrollInfoResponse struct {
	BrowserID string  `json:"browserId"`
	PageID    string  `json:"pageId"`
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
	MaxX      float64 `json:"maxX"`
	MaxY      float64 `json:"maxY"`
}

// ScrollPageRequest is the payload for POST /api/v1/browsers/pages/:id/scroll.
type ScrollPageRequest struct {
	BrowserID string  `json:"browserId"`
	Left      float64 `json:"left,omitempty"`
	Top       float64 `json:"top,omitempty"`
}

// ScrollPageResponse is the response from POST /api/v1/browsers/pages/:id/scroll.
type ScrollPageResponse struct {
	BrowserID string  `json:"browserId"`
	PageID    string  `json:"pageId"`
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
}
