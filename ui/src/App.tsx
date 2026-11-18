import { useEffect, useState } from "react";
import { AppBar } from "./components/AppBar"
import Box from '@mui/material/Box';
import { LiveViewBrowser } from "./components/LiveView";


type Message = {
  type: string;
  img: string;
};

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);

  const [browsers, setBrowsers] = useState(undefined)

  const [currentBrowser, setCurrentBrowser] = useState<string | undefined>(undefined)
  const [currentPage, setCurrentPage] = useState<string | undefined>(undefined)

  useEffect(() => {
    const ws_url = "ws://localhost:3777/api/v1/ws"
    const browserId ="18c38237-e214-4e9e-a3d9-05193b95837a"
    const pageId="269cb5c2-0de6-4447-9ec1-620e7e117cf5"
    const query = `browserId=${browserId}&pageId=${pageId}`
    const ws = new WebSocket(`${ws_url}?${query}`)

    ws.onopen = () => {
      console.log("WebSocket подключен");
      setConnected(true);
    }

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setMessages((prev) => [...prev, data]);
    }
    return () => ws.close();
  }, []);

  return (
    <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <AppBar />
      <Box
        component="main"
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          bgcolor: '#13131b',
        }}>
        <LiveViewBrowser img={messages.at(-1)?.img} />
      </Box>
    </Box>
  )
}

export default App
