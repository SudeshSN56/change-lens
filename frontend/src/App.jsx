import { useEffect, useState } from "react";
import { Shell } from "./components/Shell";
import { TipLayer } from "./components/Tip";
import { ErrorBox } from "./components/ui";
import { getJSON, go, isTyping, useRoute } from "./lib/hooks";
import Analyze from "./views/Analyze";
import Dossier from "./views/Dossier";
import Explorer from "./views/Explorer";
import Overview from "./views/Overview";
import Search from "./views/Search";
import "./theme.css";

export default function App() {
  const route = useRoute();
  const [health, setHealth] = useState(null);
  const [online, setOnline] = useState(null);
  const [page, id] = route.parts;
  const pathKey = route.parts.join("/");

  useEffect(() => {
    const ping = () =>
      getJSON("/api/health")
        .then((h) => {
          setHealth(h);
          setOnline(true);
        })
        .catch(() => setOnline(false));
    ping();
    const t = setInterval(ping, 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathKey]);

  // "/" focuses the query box from anywhere.
  useEffect(() => {
    const on = (e) => {
      if (e.key !== "/" || isTyping(e.target) || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      if (page !== "search") go("/search");
      setTimeout(() => document.getElementById("q")?.focus(), 40);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [page]);

  let view;
  if (!page) view = <Overview />;
  else if (page === "search") view = <Search params={route.params} />;
  else if (page === "explore") view = <Explorer />;
  else if (page === "analyze") view = <Analyze health={health} />;
  else if (page === "pair" && id) view = <Dossier id={id} params={route.params} />;
  else view = <ErrorBox title="Page not found" detail={`#/${pathKey}`} hint="Use the navigation on the left." />;

  return (
    <>
      <Shell page={page === "pair" ? null : (page ?? "")} health={health} online={online}>
        {view}
      </Shell>
      <TipLayer />
    </>
  );
}
