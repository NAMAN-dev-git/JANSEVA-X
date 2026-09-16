import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthContext";

const navItems = [{ to: "/", label: "Home", end: true }, { to: "/services", label: "Services" }, { to: "/applications", label: "My Applications" }, { to: "/documents", label: "Issued Demo Documents" }, { to: "/profile", label: "Profile" }];
export function PortalLayout() {
  const { user, signOut } = useAuth(); const navigate = useNavigate();
  return <div className="portal-shell"><header className="site-header"><NavLink className="brand" to="/">JANSEVA-X <small>CITIZEN PORTAL</small></NavLink><nav aria-label="Primary navigation">{navItems.map((item) => <NavLink key={item.to} end={item.end} to={item.to}>{item.label}</NavLink>)}</nav><button className="avatar" onClick={() => navigate("/profile")} aria-label="Open profile">{user?.citizenProfile?.fullName.slice(0, 1).toUpperCase() ?? "P"}</button></header><main className="page"><Outlet /></main><footer className="site-footer"><span><strong>JANSEVA-X</strong> | Citizen services prototype</span><button className="text-button" onClick={() => void signOut()}>Sign out</button></footer></div>;
}
