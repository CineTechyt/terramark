import { AppBar, Toolbar, Typography, Box, IconButton } from "@mui/material";
import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import logo from "../assets/logo.png";

const Navbar = () => {
  // nav items with paths
  const navItems = [
    { key: "mark", label: "Mark", path: "/" },
    { key: "maps", label: "Maps", path: "/maps" },
    { key: "statistics", label: "Statistics", path: "/statistics" },
  ];

  const navigate = useNavigate();
  const location = useLocation();

  const getActiveFromPath = (p: string) => {
    if (p === "/" || p === "") return "mark";
    if (p.startsWith("/maps")) return "maps";
    if (p.startsWith("/statistics")) return "statistics";
    return "mark";
  };

  const [active, setActive] = useState<string>(() => getActiveFromPath(location.pathname));

  useEffect(() => {
    setActive(getActiveFromPath(location.pathname));
  }, [location.pathname]);

  const handleNavClick = (path: string) => {
    if (location.pathname !== path) navigate(path);
  };

  return (
    <AppBar position="static" color="transparent" elevation={0}>
      <Toolbar
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          py: 1,
        }}
      >
        {/* Logo + Text */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <IconButton disableRipple>
            <Box component="img" src={logo} alt="TerraMark logo" sx={{ height: 80, width: "auto" }} />
          </IconButton>

          {/* show title only on sm and up - use futuristic/minimal style */}
          <Typography
            component="div"
            sx={{
              display: { xs: "none", sm: "block" },
              fontFamily: "'Orbitron', 'Rajdhani', 'Poppins', sans-serif",
              fontWeight: 300,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#1976d2",
              fontSize: { xs: "0.9rem", sm: "1.1rem" },
            }}
          >
            TerraMark
          </Typography>
        </Box>

        {/* Spacer */}
        <Box sx={{ flexGrow: 1 }} />

        {/* Navigation items: always visible (xs..xl), clickable buttons, highlight active */}
        <Box sx={{ display: "flex", gap: { xs: 1, sm: 3 } }}>
          {navItems.map((item) => {
            const isActive = active === item.key;
            return (
              <Box component="span" key={item.key}>
                <IconButton
                  onClick={() => handleNavClick(item.path)}
                  aria-current={isActive ? "page" : undefined}
                  sx={{
                    // use IconButton to keep accessible button semantics but style like text button
                    p: 0,
                    minWidth: 0,
                    borderRadius: 0,
                    "&:hover": { background: "transparent", color: "primary.main" },
                  }}
                >
                  <Box
                    component="div"
                    sx={{
                      fontFamily: "'Poppins', sans-serif",
                      fontWeight: 500,
                      color: isActive ? "primary.main" : "text.primary",
                      pb: "6px",
                      borderBottom: isActive ? 2 : "2px solid transparent",
                      borderColor: isActive ? "primary.main" : "transparent",
                      cursor: "pointer",
                      px: { xs: 0.5, sm: 0 },
                      fontSize: { xs: "0.95rem", sm: "1rem" },
                      lineHeight: 1,
                    }}
                  >
                    {item.label}
                  </Box>
                </IconButton>
              </Box>
            );
          })}
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Navbar;