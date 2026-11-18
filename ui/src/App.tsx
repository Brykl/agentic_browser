import { useCallback, useEffect, useState } from "react";
import { AppBar, type BrowserSummary, type PageSummary } from "./components/AppBar";
import Box from "@mui/material/Box";
import { LiveViewBrowser } from "./components/LiveView";

type WsFrameMessage = {
  type: string;
  img: string | null;
};

function App() {
  const [frame, setFrame] = useState<string | undefined>();
  const [connected, setConnected] = useState(false);
  const [browsers, setBrowsers] = useState<BrowserSummary[]>([]);
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [currentBrowser, setCurrentBrowser] = useState<string | undefined>();
  const [currentPage, setCurrentPage] = useState<string | undefined>();

  const fetchBrowsers = useCallback(async (signal?: AbortSignal) => {
    const res = await fetch("/api/v1/browsers", { cache: "no-store", signal });
    if (!res.ok) return [];
    const data: { browsers: BrowserSummary[] } = await res.json();
    setBrowsers(data.browsers);
    setCurrentBrowser((prev) =>
      prev && data.browsers.some((b) => b.id === prev)
        ? prev
        : data.browsers[0]?.id,
    );
    return data.browsers;
  }, []);

  const fetchPages = useCallback(
    async (browserId: string, signal?: AbortSignal) => {
      const res = await fetch(
        `/api/v1/browsers/pages?browserId=${encodeURIComponent(browserId)}`,
        { cache: "no-store", signal },
      );
      if (!res.ok) return [];
      const data: { browserId: string; pages: PageSummary[] } = await res.json();
      setPages(data.pages);
      return data.pages;
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();

    async function init() {
      try {
        const list = await fetchBrowsers(controller.signal);
        const firstBrowser = list[0]?.id;
        if (firstBrowser) {
          setCurrentBrowser(firstBrowser);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Failed to load browsers:", err);
        }
      }
    }

    void init();
    return () => controller.abort();
  }, [fetchBrowsers]);

  useEffect(() => {
    if (!currentBrowser) {
      setPages([]);
      setCurrentPage(undefined);
      return;
    }

    const controller = new AbortController();

    async function load() {
      try {
        const list = await fetchPages(currentBrowser!, controller.signal);
        setCurrentPage((prev) =>
          prev && list.some((p) => p.pageId === prev) ? prev : list[0]?.pageId,
        );
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Failed to load pages:", err);
        }
      }
    }

    void load();
    const poll = setInterval(() => {
      void fetchBrowsers();
      void load();
    }, 2000);
    return () => {
      clearInterval(poll);
      controller.abort();
    };
  }, [currentBrowser, fetchBrowsers, fetchPages]);

  useEffect(() => {
    if (!currentBrowser || !currentPage) {
      setConnected(false);
      setFrame(undefined);
      return;
    }

    let disposed = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/v1/ws`;
    const query = new URLSearchParams({
      browserId: currentBrowser,
      pageId: currentPage,
    }).toString();

    setConnected(false);
    setFrame(undefined);

    const connect = () => {
      if (disposed) return;
      ws = new WebSocket(`${wsUrl}?${query}`);

      ws.onopen = () => {
        if (!disposed) setConnected(true);
      };

      ws.onmessage = (event) => {
        if (disposed) return;
        const data: WsFrameMessage = JSON.parse(event.data);
        if (data.img) {
          setFrame(data.img);
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        setConnected(false);
        reconnectTimer = setTimeout(connect, 1000);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [currentBrowser, currentPage]);

  const handleCreateBrowser = async () => {
    try {
      const res = await fetch("/api/v1/browsers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: "ui", headless: true }),
      });
      if (!res.ok) return;
      const { browserId }: { browserId: string } = await res.json();
      await fetchBrowsers();
      setCurrentBrowser(browserId);
      setCurrentPage(undefined);
    } catch (err) {
      console.error("Failed to create browser:", err);
    }
  };

  const handleCreatePage = async () => {
    if (!currentBrowser) return;
    try {
      const res = await fetch("/api/v1/browsers/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          browserId: currentBrowser,
          pageUrl: "https://example.com",
        }),
      });

      let createdPageId: string | undefined;
      if (res.ok) {
        try {
          const data: { pageId?: string } = await res.json();
          createdPageId = data.pageId;
        } catch {
          // Fallback if backend hasn't been restarted and returns plain text
        }
      }

      const updatedPages = await fetchPages(currentBrowser);
      void fetchBrowsers();
      const targetPageId = createdPageId ?? updatedPages.at(-1)?.pageId;
      if (targetPageId) {
        setCurrentPage(targetPageId);
      }
    } catch (err) {
      console.error("Failed to create page:", err);
    }
  };

  const handleClosePage = async (pageId: string) => {
    if (!currentBrowser) return;
    try {
      const res = await fetch(
        `/api/v1/browsers/pages/${encodeURIComponent(pageId)}?browserId=${encodeURIComponent(currentBrowser)}`,
        { method: "DELETE" },
      );
      if (!res.ok) return;
      setPages((prev) => {
        const remaining = prev.filter((p) => p.pageId !== pageId);
        if (currentPage === pageId) {
          setCurrentPage(remaining[0]?.pageId);
        }
        return remaining;
      });
    } catch (err) {
      console.error("Failed to close page:", err);
    }
  };

  const handleUpdatePageUrl = async (pageId: string, pageUrl: string) => {
    if (!currentBrowser) return;
    try {
      const res = await fetch(
        `/api/v1/browsers/pages/${encodeURIComponent(pageId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ browserId: currentBrowser, pageUrl }),
        },
      );
      if (!res.ok) return;
      const data: { pageId: string; url: string } = await res.json();
      setPages((prev) =>
        prev.map((p) => (p.pageId === pageId ? { ...p, url: data.url } : p)),
      );
    } catch (err) {
      console.error("Failed to update page URL:", err);
    }
  };

  return (
    <Box sx={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
      <AppBar
        browsers={browsers}
        currentBrowser={currentBrowser}
        pages={pages}
        currentPage={currentPage}
        connected={connected}
        onSelectBrowser={(id) => {
          setCurrentBrowser(id);
          setCurrentPage(undefined);
        }}
        onCreateBrowser={() => void handleCreateBrowser()}
        onSelectPage={setCurrentPage}
        onCreatePage={() => void handleCreatePage()}
        onClosePage={(id) => void handleClosePage(id)}
        onUpdatePageUrl={handleUpdatePageUrl}
      />
      <Box
        component="main"
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          bgcolor: "#13131b",
        }}
      >
        <LiveViewBrowser img={frame} />
      </Box>
    </Box>
  );
}

export default App;
