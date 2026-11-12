import { useEffect, useState } from "react";
import { AppBar } from "./components/AppBar"
import Box from '@mui/material/Box';
import { LiveViewBrowser } from "./components/liveView";

type Message = {
  type: string;
  img: string;
};

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:3777/api/v1/ws")

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
        {/* {messages.map((message, index) => (
          <p key={index}>{message.img}</p>
        ))} */}
      </Box>
    </Box>
  )
}

export default App
