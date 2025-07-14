import React, { useEffect, useState } from 'react';
import { db } from '../services/firebase';
import { ref, onValue, update } from 'firebase/database';

// Define standard emergency types
const STANDARD_TYPES = ['Fire', 'Crime', 'Medical', 'Accident'] as const;
type StandardType = typeof STANDARD_TYPES[number];

interface Report {
  type: string;
  description: string;
  location: { lat: number; lng: number };
  timestamp: number;
  deviceId: string;
  status: 'active' | 'responded' | 'resolved';
  responseTime?: number;
}

type StatusFilter = Report['status'] | 'all';
type TypeFilter = string | 'all';

const ReportList: React.FC = () => {
  const [reports, setReports] = useState<(Report & { id: string })[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [isConfirmingAction, setIsConfirmingAction] = useState<{
    reportId: string;
    action: 'respond' | 'resolve';
  } | null>(null);

  // Enhanced emergency type counting with simplified Other handling
  const emergencyTypeCounts = reports.reduce((acc, report) => {
    const type = STANDARD_TYPES.includes(report.type as StandardType) ? report.type : 'Other';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Filter reports based on selected filters
  const filteredReports = reports.filter(report => {
    const matchesStatus = statusFilter === 'all' || report.status === statusFilter;
    const matchesType = typeFilter === 'all' || 
      (typeFilter === 'Other' ? !STANDARD_TYPES.includes(report.type as StandardType) : report.type === typeFilter);
    return matchesStatus && matchesType;
  });

  useEffect(() => {
    const reportsRef = ref(db, 'reports');
    const unsubscribe = onValue(reportsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const reportsArray = Object.entries(data)
          .map(([id, report]) => ({ ...(report as Report), id }))
          .sort((a, b) => b.timestamp - a.timestamp);
        setReports(reportsArray);
      } else {
        setReports([]);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleRespond = async (reportId: string, status: 'responded' | 'resolved') => {
    try {
      const report = reports.find(r => r.id === reportId);
      if (!report) return;

      const now = Date.now();
      
      // Get all relevant reports from the same device
      const relatedReports = reports.filter(r => 
        r.deviceId === report.deviceId && 
        (status === 'responded' ? r.status === 'active' : ['active', 'responded'].includes(r.status))
      );
      
      // Prepare batch updates for all related reports
      const updates: Record<string, any> = {};
      relatedReports.forEach(r => {
        updates[`reports/${r.id}`] = {
          ...r,
          status,
          responseTime: now - r.timestamp,
          ...(status === 'resolved' ? { location: null } : {}) // Clear location only for resolve
        };
      });
      
      await update(ref(db), updates);
      showToast(
        `${status === 'responded' ? 'Marked' : 'Resolved'} ${relatedReports.length} report${relatedReports.length > 1 ? 's' : ''} from device ${report.deviceId}`
      );
    } catch (error) {
      console.error('Error updating response:', error);
      showToast('Failed to update response', 'error');
    } finally {
      setIsConfirmingAction(null); // Clear any active confirmation
    }
  };

  const initiateAction = (reportId: string, action: 'respond' | 'resolve') => {
    const report = reports.find(r => r.id === reportId);
    if (!report) return;

    const relatedReports = reports.filter(r => 
      r.deviceId === report.deviceId && 
      (action === 'respond' ? r.status === 'active' : ['active', 'responded'].includes(r.status))
    );

    if (relatedReports.length > 1) {
      setIsConfirmingAction({ reportId, action });
    } else {
      handleRespond(reportId, action === 'respond' ? 'responded' : 'resolved');
    }
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const getStatusBadge = (status: Report['status']) => {
    const badges = {
      active: 'bg-red-100 text-red-800',
      in_progress: 'bg-yellow-100 text-yellow-800',
      responded: 'bg-green-100 text-green-800',
      resolved: 'bg-gray-100 text-gray-600'
    };
    return badges[status];
  };

  const renderActionButtons = (report: Report & { id: string }) => {
    if (report.status === 'resolved') return null;

    const isConfirming = isConfirmingAction?.reportId === report.id;
    const confirmationMessage = isConfirmingAction?.action === 'respond' 
      ? 'Mark all active reports from this device as responded?'
      : 'Resolve all reports from this device?';

    return (
      <div className="flex justify-end space-x-2">
        {isConfirming ? (
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">{confirmationMessage}</span>
            <button
              onClick={() => handleRespond(
                report.id,
                isConfirmingAction.action === 'respond' ? 'responded' : 'resolved'
              )}
              className="px-3 py-1 text-sm text-white bg-blue-600 rounded hover:bg-blue-700"
            >
              Yes
            </button>
            <button
              onClick={() => setIsConfirmingAction(null)}
              className="px-3 py-1 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
            >
              No
            </button>
          </div>
        ) : (
          <>
            {report.status === 'active' && (
              <button
                onClick={() => initiateAction(report.id, 'respond')}
                className="px-3 py-1 text-sm text-green-700 bg-green-50 rounded hover:bg-green-100"
              >
                Mark Responded
              </button>
            )}
            <button
              onClick={() => initiateAction(report.id, 'resolve')}
              className="px-3 py-1 text-sm text-gray-700 bg-gray-50 rounded hover:bg-gray-100"
            >
              Resolve
            </button>
          </>
        )}
      </div>
    );
  };

  const getStatusCount = (status: Report['status']) => {
    return reports.filter(r => r.status === status).length;
  };

  const renderStatusFilters = () => {
    const statuses: Array<{ value: Report['status']; label: string; color: string }> = [
      { value: 'active', label: 'Active', color: 'red' },
      { value: 'responded', label: 'Responded', color: 'green' },
      { value: 'resolved', label: 'Resolved', color: 'gray' }
    ];

    return (
      <div className="grid grid-cols-3 gap-1">
        {statuses.map(({ value, label, color }) => {
          const count = getStatusCount(value);
          const isSelected = statusFilter === value;
          return (
            <button
              key={value}
              onClick={() => setStatusFilter(statusFilter === value ? 'all' : value)}
              className={`relative px-2 py-1 rounded-lg transition-all duration-200 ${
                isSelected 
                  ? `bg-${color}-100 border-2 border-${color}-500 shadow-inner`
                  : `bg-white hover:bg-${color}-50 border border-gray-200`
              }`}
            >
              <div className="flex flex-col items-start">
                <span className={`text-xs font-medium ${isSelected ? `text-${color}-700` : 'text-gray-500'}`}>
                  {label}
                </span>
                <span className={`text-2xl font-bold ${isSelected ? `text-${color}-600` : `text-${color}-500`}`}>
                  {count}
                </span>
              </div>
              {isSelected && (
                <div className={`absolute top-1 right-1 w-2 h-2 rounded-full bg-${color}-500`} />
              )}
            </button>
          );
        })}
      </div>
    );
  };

  const renderTypeFilters = () => {
    const types = [
      { value: 'Fire', color: 'red' },
      { value: 'Crime', color: 'blue' },
      { value: 'Medical', color: 'green' },
      { value: 'Accident', color: 'yellow' },
      { value: 'Other', color: 'gray' }
    ];

    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-2 py-1 border-b border-gray-200">
          <h3 className="text-sm font-medium text-gray-700">Emergency Types</h3>
        </div>
        <div className="grid grid-cols-5 divide-x divide-gray-200">
          {types.map(({ value, color }) => {
            const count = emergencyTypeCounts[value] || 0;
            const isSelected = typeFilter === value;
            return (
              <button
                key={value}
                onClick={() => setTypeFilter(typeFilter === value ? 'all' : value)}
                className={`px-2 py-1 transition-all duration-200 ${
                  isSelected 
                    ? `bg-${color}-50 shadow-inner`
                    : `hover:bg-${color}-50`
                }`}
              >
                <div className="flex flex-col items-center">
                  <span className={`text-lg font-semibold ${isSelected ? `text-${color}-700` : `text-${color}-600`}`}>
                    {count}
                  </span>
                  <span className={`text-xs ${isSelected ? `text-${color}-700` : 'text-gray-500'}`}>
                    {value}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="relative">
      {/* Sticky Header Container */}
      <div className="sticky top-0 z-10 bg-gray-100 shadow-md">
        <div className="p-4 space-y-4">
          {renderStatusFilters()}
          {renderTypeFilters()}
        </div>
      </div>

      {/* Click away listener for Other Types dropdown */}
      {/* This part is no longer needed as Other Types are now a single button */}

      {/* Emergency List */}
      <div className="bg-white rounded-lg shadow mt-2 mx-2">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">Emergency Reports</h3>
          {(statusFilter !== 'all' || typeFilter !== 'all') && (
            <button
              onClick={() => {
                setStatusFilter('all');
                setTypeFilter('all');
              }}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Clear Filters
            </button>
          )}
        </div>
        <div className="divide-y divide-gray-200">
          {filteredReports.map((report) => (
            <div key={report.id} className="p-4 hover:bg-gray-50">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(report.status)}`}>
                      {report.status.replace('_', ' ').toUpperCase()}
                    </span>
                    <span className="text-sm font-medium text-gray-900">
                      {report.type}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(report.timestamp).toLocaleString()}
                  </div>
                </div>
                
                <div className="text-sm text-gray-600">
                  <div className="mb-1">
                    <span className="font-medium text-gray-700">Device ID: </span>
                    {report.deviceId}
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Description: </span>
                    {report.description || 'No description provided'}
                  </div>
                </div>

                {renderActionButtons(report)}
              </div>
            </div>
          ))}
          {filteredReports.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              {reports.length === 0 ? 'No emergency reports' : 'No reports match the selected filters'}
            </div>
          )}
        </div>
      </div>

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

export default ReportList; 