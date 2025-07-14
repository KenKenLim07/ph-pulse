import React, { useEffect, useState } from 'react';
import { db } from '../services/firebase';
import { ref, onValue, update, get } from 'firebase/database';

interface Device {
  totalReports: number;
  lastReportTime: number;
  isBlocked: boolean;
  blockedAt?: number;
  blockReason?: string;
}

interface DeviceWithReports extends Device {
  id: string;
  reports: any[];
}

interface ViewModal {
  isOpen: boolean;
  device: DeviceWithReports | null;
}

const DevicePanel: React.FC = () => {
  const [devices, setDevices] = useState<DeviceWithReports[]>([]);
  const [viewModal, setViewModal] = useState<ViewModal>({ isOpen: false, device: null });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    const devicesRef = ref(db, 'devices');
    const reportsRef = ref(db, 'reports');

    // First, get all reports
    const unsubscribeReports = onValue(reportsRef, async (reportsSnapshot) => {
      const reportsData = reportsSnapshot.val() || {};
      
      // Then get all devices and combine with their reports
      const unsubscribeDevices = onValue(devicesRef, (devicesSnapshot) => {
        const devicesData = devicesSnapshot.val() || {};
        
        const devicesArray = Object.entries(devicesData).map(([id, device]) => {
          const deviceReports = Object.values(reportsData).filter(
            (report: any) => report.deviceId === id
          );
          
          return {
            id,
            ...(device as Device),
            reports: deviceReports,
            totalReports: deviceReports.length
          };
        });

        setDevices(devicesArray.sort((a, b) => (b.lastReportTime || 0) - (a.lastReportTime || 0)));
      });

      return () => {
        unsubscribeDevices();
      };
    });

    return () => {
      unsubscribeReports();
    };
  }, []);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleBlock = async (deviceId: string) => {
    try {
      // Update device status
      await update(ref(db, `devices/${deviceId}`), {
        isBlocked: true,
        blockedAt: Date.now()
      });

      // Update all reports from this device
      const reportsRef = ref(db, 'reports');
      const snapshot = await get(reportsRef);
      
      if (snapshot.exists()) {
        const updates: Record<string, any> = {};
        Object.entries(snapshot.val()).forEach(([reportId, report]: [string, any]) => {
          if (report.deviceId === deviceId) {
            updates[`reports/${reportId}/status`] = 'blocked';
          }
        });
        
        if (Object.keys(updates).length > 0) {
          await update(ref(db), updates);
        }
      }

      showToast('Device blocked successfully');
    } catch (error) {
      console.error('Error blocking device:', error);
      showToast('Failed to block device', 'error');
    }
  };

  const handleUnblock = async (deviceId: string) => {
    try {
      // Update device status
      await update(ref(db, `devices/${deviceId}`), {
        isBlocked: false,
        blockedAt: null,
        blockReason: null
      });

      // Update all reports from this device back to active
      const reportsRef = ref(db, 'reports');
      const snapshot = await get(reportsRef);
      
      if (snapshot.exists()) {
        const updates: Record<string, any> = {};
        Object.entries(snapshot.val()).forEach(([reportId, report]: [string, any]) => {
          if (report.deviceId === deviceId && report.status === 'blocked') {
            updates[`reports/${reportId}/status`] = 'active';
          }
        });
        
        if (Object.keys(updates).length > 0) {
          await update(ref(db), updates);
        }
      }

      showToast('Device unblocked successfully');
    } catch (error) {
      console.error('Error unblocking device:', error);
      showToast('Failed to unblock device', 'error');
    }
  };

  const formatDate = (timestamp: number) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="p-4">
      {/* Desktop View */}
      <div className="hidden md:block bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 border border-gray-200">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr className="divide-x divide-gray-500">
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-l border-gray-200">
                Client ID
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-l border-gray-200">
                Reports Sent
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-l border-gray-200">
                Last Report
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-l border-gray-200">
                Status
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-l border-gray-200">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {devices.map((device) => (
              <tr key={device.id} className="hover:bg-gray-50 divide-x divide-gray-200">
                <td className="px-6 py-4 whitespace-nowrap border-l border-gray-200">
                  <div className="text-sm font-mono text-gray-900">
                    {device.id}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap border-l border-gray-200">
                  <div className="text-sm text-gray-900 flex items-center">
                    <span>{device.totalReports}</span>
                    <div className="mx-3 h-4 w-px bg-gray-200"></div>
                    <button
                      onClick={() => setViewModal({ isOpen: true, device })}
                      className="px-3 py-1 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded transition-colors duration-150"
                      title="View device reports"
                    >
                      View
                    </button>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap border-l border-gray-200">
                  <div className="text-sm text-gray-900">
                    {formatDate(device.lastReportTime)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap border-l border-gray-200">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    device.isBlocked ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                  }`}>
                    {device.isBlocked ? 'Blocked' : 'Active'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap border-l border-gray-200">
                  <div className="flex items-center">
                    {device.isBlocked ? (
                      <button
                        onClick={() => handleUnblock(device.id)}
                        className="px-3 py-1 text-green-600 hover:text-green-900 hover:bg-green-50 rounded transition-colors duration-150"
                        title="Unblock device"
                      >
                        Unblock
                      </button>
                    ) : (
                      <button
                        onClick={() => handleBlock(device.id)}
                        className="px-3 py-1 text-red-600 hover:text-red-900 hover:bg-red-50 rounded transition-colors duration-150"
                        title="Block device"
                      >
                        Block
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile View */}
      <div className="md:hidden space-y-4">
        {devices.map((device) => (
          <div key={device.id} className="bg-white rounded-lg shadow overflow-hidden">
            {/* Device Info */}
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-mono text-gray-900">
                  {device.id}
                </span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  device.isBlocked ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                }`}>
                  {device.isBlocked ? 'Blocked' : 'Active'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="text-gray-500">
                  Reports: <span className="font-medium text-gray-900">{device.totalReports}</span>
                </div>
                <div className="text-gray-500">
                  Last: <span className="font-medium text-gray-900">{formatDate(device.lastReportTime)}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="p-4 bg-gray-50 flex items-center gap-2">
              <button
                onClick={() => setViewModal({ isOpen: true, device })}
                className="flex-1 py-2 px-4 bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 transition-colors text-sm font-medium"
              >
                View Reports
              </button>
              {device.isBlocked ? (
                <button
                  onClick={() => handleUnblock(device.id)}
                  className="flex-1 py-2 px-4 bg-green-50 text-green-700 rounded-md hover:bg-green-100 transition-colors text-sm font-medium"
                >
                  Unblock Device
                </button>
              ) : (
                <button
                  onClick={() => handleBlock(device.id)}
                  className="flex-1 py-2 px-4 bg-red-50 text-red-700 rounded-md hover:bg-red-100 transition-colors text-sm font-medium"
                >
                  Block Device
                </button>
              )}
            </div>
          </div>
        ))}
        
        {devices.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            No devices found
          </div>
        )}
      </div>

      {/* Modal - Optimized for mobile */}
      {viewModal.isOpen && viewModal.device && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-0 sm:p-4 backdrop-blur-sm z-50">
          <div className="bg-white w-full sm:rounded-lg sm:max-w-4xl h-full sm:h-auto sm:max-h-[80vh] overflow-y-auto shadow-xl relative">
            <div className="flex justify-between items-center sticky top-0 bg-white px-4 py-3 border-b z-10">
              <h3 className="text-lg font-semibold text-gray-900 truncate">
                Device Reports: {viewModal.device.id}
              </h3>
              <button
                onClick={() => setViewModal({ isOpen: false, device: null })}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              {viewModal.device.reports.map((report: any, index: number) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      report.type === 'Fire' ? 'bg-red-100 text-red-800' :
                      report.type === 'Crime' ? 'bg-blue-100 text-blue-800' :
                      report.type === 'Medical' ? 'bg-green-100 text-green-800' :
                      report.type === 'Accident' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {report.type}
                    </span>
                    <span className="text-sm text-gray-500">
                      {new Date(report.timestamp).toLocaleString()}
                    </span>
                  </div>
                  {report.description && (
                    <p className="mt-2 text-sm text-gray-600">{report.description}</p>
                  )}
                  <div className="mt-2 text-xs text-gray-500">
                    Status: <span className={`font-medium ${
                      report.status === 'active' ? 'text-red-600' :
                      report.status === 'in_progress' ? 'text-yellow-600' :
                      report.status === 'responded' ? 'text-green-600' :
                      'text-gray-600'
                    }`}>{report.status.replace('_', ' ').toUpperCase()}</span>
                  </div>
                </div>
              ))}
              {viewModal.device.reports.length === 0 && (
                <div className="text-center text-gray-500 py-8">
                  No reports found for this device
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-2 rounded-md shadow-lg z-50 ${
          toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
        } text-white`}>
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default DevicePanel; 