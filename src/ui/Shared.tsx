import { Container, Typography, Card } from "@mui/material";
import { styled } from "@mui/material/styles";

/**
 * Shared, reusable UI primitives:
 * - StyledContainer: page container with top margin
 * - HeaderTitle: minimalist / futuristic page title
 * - MapRow / MapBox: responsive square map wrapper
 * - ControlCard: centered card for controls
 * - BottomSpacer: consistent bottom spacing
 */

export const StyledContainer = styled(Container)(({ theme }) => ({
  marginTop: theme.spacing(3),
}));

export const HeaderTitle = styled(Typography)(({ theme }) => ({
  fontFamily: "'Orbitron', 'Rajdhani', 'Poppins', sans-serif",
  fontWeight: 300,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: theme.palette.text.primary,
  marginBottom: theme.spacing(2),
  fontSize: "1.6rem",
  [theme.breakpoints.up("md")]: {
    fontSize: "2rem",
  },
}));

export const MapRow = styled("div")(({ theme }) => ({
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  marginBottom: theme.spacing(3),
}));

export const MapBox = styled("div")(({ theme }) => ({
  width: "80vw",
  maxWidth: 900,
  aspectRatio: "1 / 1",
  boxSizing: "border-box",
  display: "block",
  position: "relative",
  maxHeight: "80vh",
  boxShadow: theme.shadows[3],
  borderRadius: theme.shape.borderRadius,
  overflow: "hidden",
  [theme.breakpoints.up("md")]: {
    width: "40vw",
  },
  "& > *": {
    position: "absolute !important",
    top: 0,
    left: 0,
    width: "100% !important",
    height: "100% !important",
  },
  "& .leaflet-container, & canvas, & iframe": {
    width: "100% !important",
    height: "100% !important",
  },
}));

export const ControlCard = styled(Card)(({ theme }) => ({
  padding: theme.spacing(2),
  paddingBottom: theme.spacing(6),
  display: "block",
  maxWidth: 720,
  marginLeft: "auto",
  marginRight: "auto",
}));

export const BottomSpacer = styled("div")(({ theme }) => ({
  height: theme.spacing(20),
}));
