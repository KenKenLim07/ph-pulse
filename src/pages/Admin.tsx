import React, { useEffect, useState, useRef } from 'react';
import { db } from '../services/firebase';
import { ref, onValue } from 'firebase/database';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import ReportList from '../components/ReportList';
import DevicePanel from '../components/DevicePanel';

// Set up default Leaflet icons
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Add custom CSS for popup styling
const addCustomStyles = () => {
  const style = document.createElement('style');
  style.textContent = `
    .custom-popup .leaflet-popup-content-wrapper {
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      border: 1px solid #e5e7eb;
    }
    
    .custom-popup .leaflet-popup-content {
      margin: 0;
      padding: 0;
    }
    
    /* Professional approach: Marker has higher z-index but popup has pointer-events */
    .incident-marker {
      z-index: 1001 !important;
      pointer-events: auto !important;
    }
    
    /* Popup appears over marker but allows marker hover through */
    .custom-popup {
      pointer-events: auto;
      z-index: 1000;
    }
    
    /* Create a "hover bridge" - invisible area around marker that maintains hover */
    .incident-marker::after {
      content: '';
      position: absolute;
      top: -10px;
      left: -10px;
      right: -10px;
      bottom: -10px;
      z-index: 1002;
      pointer-events: none;
    }
    
    /* Ensure popup doesn't block marker hover in the center area */
    .custom-popup .leaflet-popup-content-wrapper {
      pointer-events: auto;
    }
  `;
  document.head.appendChild(style);
};

// Initialize custom styles
addCustomStyles();

// Helper to get badge label and color for each incident type
function getIncidentBadge(type: string) {
  switch (type) {
    case 'Fire': return { label: 'F', color: 'bg-red-600' };
    case 'Crime': return { label: 'C', color: 'bg-blue-600' };
    case 'Medical': return { label: 'M', color: 'bg-green-600' };
    case 'Accident': return { label: 'A', color: 'bg-yellow-500' };
    default: return { label: 'O', color: 'bg-gray-500' };
  }
}

// Professional badge + pulsing dot icon
const getIncidentIcon = (type: string) => {
  const { label, color } = getIncidentBadge(type);
  return L.divIcon({
    className: 'incident-marker',
    html: `
      <span class="relative flex h-6 w-6">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-40"></span>
        <span class="relative inline-flex rounded-full h-6 w-6 ${color} border-2 border-white shadow items-center justify-center">
          <span class="text-[10px] font-bold text-white">${label}</span>
        </span>
      </span>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],      // Center of the icon
    popupAnchor: [0, 12],      // Popup tip at bottom edge of icon
  });
};

// Helper function to create professional popup HTML
const createPopupHtml = (report: Report) => {
  const { label, color } = getIncidentBadge(report.type);
  const statusColor = color.replace('bg-', '');
  
  // Convert Tailwind color classes to hex values
  const colorMap: Record<string, string> = {
    'red-600': '#dc2626',
    'blue-600': '#2563eb',
    'green-600': '#16a34a',
    'yellow-500': '#eab308',
    'gray-500': '#6b7280',
  };
  
  const hexColor = colorMap[statusColor] || '#6b7280';
  const displayName = report.type || 'Unknown Incident';
  const description = report.description || 'No description available';
  const timestamp = new Date(report.timestamp).toLocaleString();
  const coordinates = `${report.location.lat.toFixed(4)}, ${report.location.lng.toFixed(4)}`;

  return `
    <div style="min-width: 200px; font-family: system-ui, sans-serif; padding: 8px 12px; pointer-events: auto;">
      <div style="display: flex; align-items: center; justify-content: space-between; font-weight: 700; font-size: 14px; color: #1f2937; margin-bottom: 6px; border-bottom: 1px solid #d1d5db; padding-bottom: 4px;">
        <span>${displayName}</span>
        <span style="
          display: inline-block;
          font-size: 11px;
          font-weight: 600;
          background: ${hexColor};
          color: #fff;
          border-radius: 8px;
          padding: 2px 8px;
          margin-left: 8px;
          min-width: 60px;
          text-align: center;
          letter-spacing: 0.5px;
        ">${label}</span>
      </div>
      <div style="font-size: 12px; color: #4b5563; margin-bottom: 4px; line-height: 1.4;">
        <strong>Description:</strong> ${description}
      </div>
      <div style="font-size: 11px; color: #6b7280; margin-bottom: 2px;">
        <strong>Location:</strong> ${coordinates}
      </div>
      <div style="font-size: 11px; color: #6b7280; margin-bottom: 2px;">
        <strong>Reported:</strong> ${timestamp}
      </div>
      <div style="margin-top: 8px; text-align: right;">
        <a href="https://www.google.com/maps?q=${report.location.lat},${report.location.lng}" target="_blank" rel="noopener noreferrer" style="font-size: 12px; color: #2563eb; text-decoration: underline; font-weight: 600;">View in Google Maps</a>
      </div>
    </div>
  `;
};

// Vanilla Leaflet Markers Component
const VanillaMarkers: React.FC<{ reports: Report[] }> = ({ reports }) => {
  const map = useMap();
  const markersRef = useRef<L.Marker[]>([]);

  useEffect(() => {
    // Remove old markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Add new markers
    reports.forEach((report) => {
      const icon = getIncidentIcon(report.type);
      const popupHtml = createPopupHtml(report);
      
      const marker = L.marker([report.location.lat, report.location.lng], { icon })
        .bindPopup(popupHtml, {
          className: 'custom-popup',
          offset: [0, 0], // No extra offset
          closeButton: false, // Remove close button for cleaner look
        });

      // Professional hover behavior with enhanced detection
      let popupTimeout: NodeJS.Timeout | null = null;
      let isPopupHovered = false;
      let isMarkerHovered = false;

      marker.on("mouseover", function () {
        isMarkerHovered = true;
        if (popupTimeout) {
          clearTimeout(popupTimeout);
          popupTimeout = null;
        }
        marker.openPopup();
      });

      marker.on("mouseout", function () {
        isMarkerHovered = false;
        // Only close if not hovering over popup
        if (!isPopupHovered) {
          popupTimeout = setTimeout(() => {
            if (!isPopupHovered && !isMarkerHovered) {
              marker.closePopup();
            }
          }, 200); // Slightly longer delay for better UX
        }
      });

      // Enhanced popup hover events
      marker.on("popupopen", function () {
        const popupElement = marker.getPopup()?.getElement();
        if (popupElement) {
          // Add a small invisible area around the marker to maintain hover
          const hoverBridge = document.createElement('div');
          hoverBridge.style.cssText = `
            position: absolute;
            top: -15px;
            left: -15px;
            right: -15px;
            bottom: -15px;
            z-index: 1003;
            pointer-events: none;
          `;
          popupElement.appendChild(hoverBridge);
          
          popupElement.addEventListener("mouseenter", () => {
            isPopupHovered = true;
            if (popupTimeout) {
              clearTimeout(popupTimeout);
              popupTimeout = null;
            }
          });

          popupElement.addEventListener("mouseleave", () => {
            isPopupHovered = false;
            // Only close if not hovering over marker
            if (!isMarkerHovered) {
              popupTimeout = setTimeout(() => {
                if (!isPopupHovered && !isMarkerHovered) {
                  marker.closePopup();
                }
              }, 200);
            }
          });
        }
      });

      // Add click handler
      marker.on("click", function () {
        console.log("Incident marker clicked:", report);
      });

      marker.addTo(map);
      markersRef.current.push(marker);
    });

    // Cleanup function
    return () => {
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
    };
  }, [reports, map]);

  return null; // This component does not render anything
};

interface Report {
  type: string;
  description: string;
  location: { lat: number; lng: number };
  timestamp: number;
}

type View = 'map' | 'reports' | 'devices';

const Admin: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [activeView, setActiveView] = useState<View>('map');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const reportsRef = ref(db, 'reports');
    const unsubscribe = onValue(reportsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setReports(
          Object.values(data)
            .filter((r: any): r is Report => r && r.location && typeof r.location.lat === 'number' && typeof r.location.lng === 'number')
            .sort((a: Report, b: Report) => b.timestamp - a.timestamp)
        );
      } else {
        setReports([]);
      }
    });
    return () => unsubscribe();
  }, []);

  const renderView = () => {
    switch (activeView) {
      case 'map':
        return (
          <MapContainer
            center={[11.09, 122.5]}
            zoom={9}
            scrollWheelZoom={true}
            style={{ height: 'calc(100vh - 48px)', width: '100vw' }}
            className="w-full"
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
            />
            <VanillaMarkers reports={reports} />
          </MapContainer>
        );
      case 'reports':
        return <ReportList />;
      case 'devices':
        return <DevicePanel />;
      default:
        return null;
    }
  };

  const NavButton: React.FC<{ view: View; label: string }> = ({ view, label }) => (
    <button
      onClick={() => {
        setActiveView(view);
        setIsMobileMenuOpen(false);
      }}
      className={`group relative px-4 py-2 text-sm font-medium transition-colors ${
        activeView === view
          ? 'text-blue-600'
          : 'text-gray-600 hover:text-blue-600'
      }`}
    >
      {label}
      <div className={`absolute bottom-0 left-1/2 transform -translate-x-1/2 h-0.5 bg-blue-600 transition-all duration-300 ${
        activeView === view 
          ? 'w-full' 
          : 'w-0 group-hover:w-full'
      }`} />
    </button>
  );

  return (
    <div className="flex flex-col h-screen">
      {/* Compact Navbar */}
      <nav className="bg-white border-b border-gray-200 px-4 py-2">
        <div className="flex items-center justify-between">
          {/* Logo/Brand */}
          <div className="flex items-center space-x-3">
            <div className="text-lg font-bold text-gray-800 opacity-70">
              People's Pulse
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-2">
            <NavButton view="map" label="Map View" />
            <NavButton view="reports" label="Reports" />
            <NavButton view="devices" label="Devices" />
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isMobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Navigation Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden mt-2 pb-2 border-t border-gray-200">
            <div className="flex flex-col space-y-1 pt-2">
              <NavButton view="map" label="Map View" />
              <NavButton view="reports" label="Reports" />
              <NavButton view="devices" label="Devices" />
            </div>
          </div>
        )}
      </nav>

      {/* Main Content */}
      <div className="flex-1">
        {renderView()}
      </div>
    </div>
  );
};

export default Admin;
