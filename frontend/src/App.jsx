import { useEffect, useState } from "react";
import { Shell } from "./components/Shell";
import { TipLayer } from "./components/Tip";
import { ErrorBox } from "./components/ui";
import { hasRole, useAuth } from "./lib/auth";
import { getJSON, go, isTyping, useRoute } from "./lib/hooks";
import Analyze from "./views/Analyze";
import Dossier from "./views/Dossier";
import Explorer from "./views/Explorer";
import Login from "./views/Login";
import Overview from "./views/Overview";
import Search from "./views/Search";
import Users from "./views/Users";
import "./theme.css";

export default function App() {
  const route = useRoute();
  const { user, reason } = useAuth();
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

  // Everything behind the console needs a session; the login page is the only unauthenticated view.
  if (!user) {
    return (
      <>
        <Login online={online} reason={reason} />
        <TipLayer />
      </>
    );
  }

  const forbidden = (role) => (
    <ErrorBox title="Not permitted" detail={`Requires the ${role} role; you are signed in as ${user.role}.`} hint="Ask an administrator to change your role." />
  );

  let view;
  if (!page) view = <Overview />;
  else if (page === "search") view = <Search params={route.params} />;
  else if (page === "explore") view = <Explorer />;
  else if (page === "analyze") view = hasRole("analyst", user) ? <Analyze health={health} /> : forbidden("analyst");
  else if (page === "users") view = hasRole("admin", user) ? <Users /> : forbidden("admin");
  else if (page === "pair" && id) view = <Dossier id={id} params={route.params} />;
  else view = <ErrorBox title="Page not found" detail={`#/${pathKey}`} hint="Use the navigation on the left." />;

  return (
    <>
      <Shell page={page === "pair" ? null : (page ?? "")} health={health} online={online} user={user}>
        {view}
      </Shell>
      <TipLayer />
    </>
  );
}
