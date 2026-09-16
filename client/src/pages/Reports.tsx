import React, { useState, useEffect } from 'react';
import { Navbar } from '../components/layout/Navbar';
import { AnalyticsChart } from '../components/ui/AnalyticsChart';
import {
  FiFileText,
  FiDownload,
  FiPieChart,
  FiCalendar,
  FiCheckCircle,
  FiAlertCircle,
  FiRefreshCw,
  FiPrinter,
  FiUserCheck,
} from 'react-icons/fi';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export const ReportsPage: React.FC = () => {
  const { user } = useAuth();
  const [reportType, setReportType] = useState<string>('habit');
  const [period, setPeriod] = useState<string>('7d');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [targetUserId, setTargetUserId] = useState<string>('');
  const [coachedUsers, setCoachedUsers] = useState<{ id: string; name: string; email: string }[]>([]);

  const [reportData, setReportData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch coach assigned users if coach/admin
  useEffect(() => {
    if (user?.role === 'coach' || user?.role === 'admin') {
      const token = localStorage.getItem('token');
      axios
        .get('/api/coach/users', { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => {
          if (res.data?.success) {
            setCoachedUsers(res.data.data || []);
          }
        })
        .catch(() => {});
    }
  }, [user]);

  const handleGenerateReport = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('token');

      let query = `/api/reports/view?type=${reportType}&period=${period}`;
      if (period === 'custom' && startDate && endDate) {
        query += `&startDate=${startDate}&endDate=${endDate}`;
      }
      if (targetUserId) {
        query += `&targetUserId=${targetUserId}`;
      }

      const res = await axios.get(query, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.data?.success) {
        setReportData(res.data.data);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to generate report view.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    handleGenerateReport();
  }, [reportType, period]);

  const handleExport = async (format: 'pdf' | 'excel' | 'csv') => {
    try {
      const token = localStorage.getItem('token');
      let url = `/api/reports/export?type=${reportType}&period=${period}&format=${format}`;
      if (period === 'custom' && startDate && endDate) {
        url += `&startDate=${startDate}&endDate=${endDate}`;
      }
      if (targetUserId) {
        url += `&targetUserId=${targetUserId}`;
      }

      if (format === 'pdf' || format === 'excel') {
        const response = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob',
        });

        const mimeType = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        const extension = format === 'pdf' ? 'pdf' : 'xlsx';
        const blob = new Blob([response.data], { type: mimeType });
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `${reportType}_report_${period}.${extension}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(downloadUrl);
      } else {
        window.open(url, '_blank');
      }
    } catch (_err) {
      alert(`Exporting ${format.toUpperCase()} failed. Please check server logs.`);
    }
  };

  const chartData = reportData?.trendData || [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800 shadow-xl backdrop-blur">
          <div>
            <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs uppercase tracking-wider mb-1">
              <FiFileText className="w-4 h-4" /> Module 12 — Reports & Export System
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Reports & Telemetry Center</h1>
            <p className="text-sm text-slate-400 mt-1">
              Generate real-time behavioral reports, schedule trajectory logs, and official exports in PDF & Excel format.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerateReport}
              disabled={loading}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition-colors flex items-center gap-2 text-xs font-semibold"
              title="Refresh Telemetry"
            >
              <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Controls Section */}
        <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <FiPieChart className="text-cyan-400" /> Report Configuration
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Report Type Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Report Type
              </label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-cyan-500 font-semibold"
              >
                <option value="habit">Habit Report</option>
                <option value="wake_up">Wake-Up Report</option>
                <option value="challenge">Challenge Performance Report</option>
                <option value="productivity">Productivity Report</option>
                <option value="sleep">Sleep Analytics Report</option>
                <option value="full_comprehensive">Full Comprehensive Executive Report</option>
              </select>
            </div>

            {/* Date Range Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Date Range
              </label>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-cyan-500 font-semibold"
              >
                <option value="today">Today</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="custom">Custom Date Range</option>
              </select>
            </div>

            {/* Coach / Admin Target User Selector */}
            {(user?.role === 'coach' || user?.role === 'admin') && (
              <div>
                <label className="block text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <FiUserCheck className="w-3.5 h-3.5" /> Target User
                </label>
                <select
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                  className="w-full bg-slate-950 border border-amber-500/30 text-slate-200 text-xs rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-amber-500 font-semibold"
                >
                  <option value="">My Own Telemetry Data</option>
                  {coachedUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Generate Trigger */}
            <div className="flex items-end">
              <button
                onClick={handleGenerateReport}
                disabled={loading}
                className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-xs shadow-lg shadow-cyan-500/20"
              >
                <FiPieChart className="w-4 h-4" />
                {loading ? 'Generating...' : 'Generate Report'}
              </button>
            </div>
          </div>

          {/* Custom Date Pickers */}
          {period === 'custom' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800/80">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2"
                />
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2">
              <FiAlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Report Preview Section */}
        {reportData ? (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
            {/* Report Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-800 pb-5 gap-4">
              <div>
                <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-semibold mb-1">
                  <span>Report ID: {reportData.reportId}</span> • <span>{reportData.periodLabel}</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-white">{reportData.title}</h2>
                <div className="text-xs text-slate-400 mt-1">
                  Subject: <span className="text-slate-200 font-semibold">{reportData.userName || 'User'}</span> ({reportData.userEmail || reportData.userId}) • Generated: {reportData.generatedAt}
                </div>
              </div>

              {/* Download Action Triggers */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExport('pdf')}
                  className="px-4 py-2 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 hover:from-cyan-500/30 hover:to-blue-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-extrabold rounded-xl transition-all flex items-center gap-2 shadow-md shadow-cyan-500/10"
                >
                  <FiPrinter className="w-4 h-4 text-cyan-400" /> Download PDF
                </button>
                <button
                  onClick={() => handleExport('excel')}
                  className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-extrabold rounded-xl transition-all flex items-center gap-2 shadow-md shadow-emerald-500/10"
                >
                  <FiDownload className="w-4 h-4 text-emerald-400" /> Download Excel
                </button>
              </div>
            </div>

            {/* Summary Banner */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-sm text-slate-300 leading-relaxed">
              <span className="font-bold text-cyan-400 block mb-1">Executive Summary:</span>
              {reportData.summary}
            </div>

            {/* Empty Data Handling Notice */}
            {!reportData.hasSufficientData ? (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-8 text-center space-y-3">
                <FiAlertCircle className="w-10 h-10 text-amber-400 mx-auto" />
                <h3 className="text-base font-bold text-amber-300">No Data Available for Selected Period</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Complete morning wake-up verifications, daily habit targets, and cognitive challenges to populate real telemetry for this report date range.
                </p>
              </div>
            ) : (
              <>
                {/* Metrics Grid */}
                {reportData.metrics && Object.keys(reportData.metrics).length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                      Key Telemetry Metrics
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {Object.entries(reportData.metrics).map(([key, value]: any) => (
                        <div key={key} className="bg-slate-950 border border-slate-800 p-4 rounded-xl">
                          <div className="text-[11px] text-slate-400 font-semibold">{key}</div>
                          <div className="text-lg font-black text-cyan-400 mt-1">{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Performance Chart */}
                {chartData.length > 0 && (
                  <div>
                    <AnalyticsChart
                      title="Performance Trajectory Chart"
                      data={chartData}
                      color="cyan"
                      type="area"
                      height={220}
                    />
                  </div>
                )}

                {/* Primary Telemetry Breakdown Table */}
                {reportData.tableData && reportData.tableData.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                      Historical Breakdown Records
                    </h3>
                    <div className="overflow-x-auto border border-slate-800 rounded-xl">
                      <table className="w-full text-xs text-left text-slate-300">
                        <thead className="bg-slate-950 text-slate-400 uppercase text-[10px]">
                          <tr>
                            {Object.keys(reportData.tableData[0]).map((h) => (
                              <th key={h} className="px-4 py-3 font-bold">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                          {reportData.tableData.map((row: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                              {Object.values(row).map((val: any, i: number) => (
                                <td key={i} className="px-4 py-3 font-mono">
                                  {val?.toString()}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="py-16 text-center text-slate-400 text-sm bg-slate-900/40 rounded-2xl border border-dashed border-slate-800">
            Select parameters and click <strong className="text-cyan-400">"Generate Report"</strong> to preview telemetry.
          </div>
        )}
      </main>
    </div>
  );
};

export default ReportsPage;
