import { useState, useEffect, useCallback } from "react";
import { useSelector } from "react-redux";
import API from "../../services/api";
import Chart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import "./SupervisorDashboard.css";

interface SupervisorDashboardData {
  kpi: {
    total_tasks: number;
    completion_rate: number;
    active_team_members: number;
    pending_issues: number;
  };
  progress_gauges: {
    team_goals: number;
    project_milestones: number;
    sla_compliance: number;
  };
  team_productivity: Array<{
    name: string;
    output: number;
    department: string;
  }>;
  individual_performance: Array<{
    name: string;
    speed: number;
    quality: number;
    availability: number;
    collaboration: number;
  }>;
  leaderboard: Array<{
    rank: number;
    name: string;
    score: number;
    trend: "up" | "down" | "stable";
  }>;
  task_status: {
    completed: number;
    in_progress: number;
    blocked: number;
    pending: number;
  };
  workload_heatmap: Array<{
    day: string;
    capacity: number;
    workload: number;
  }>;
  task_completion_trend: Array<{
    date: string;
    completed: number;
    moving_avg: number;
  }>;
  activity_timeline: Array<{
    milestone: string;
    start_date: string;
    end_date: string;
    status: "completed" | "in_progress" | "pending";
  }>;
  peak_hours: Array<{
    hour: number;
    activity: number;
  }>;
  velocity_chart: Array<{
    period: string;
    resolved: number;
    pending: number;
    escalated: number;
  }>;
  calls_trend: Array<{
    date: string;
    total_calls: number;
    completed_calls: number;
    missed_calls: number;
  }>;
  issue_severity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  resolution_time_trend: Array<{
    date: string;
    avg_resolution_time: number;
  }>;
  error_rate_trend: Array<{
    date: string;
    error_rate: number;
  }>;
  resource_allocation: Array<{
    project: string;
    hours: number;
  }>;
  capacity_demand: Array<{
    period: string;
    available: number;
    utilized: number;
  }>;
  skill_gap: Array<{
    skill: string;
    needed: number;
    available: number;
  }>;
  alerts: Array<{
    id: number;
    type: "critical" | "warning" | "info";
    message: string;
    timestamp: string;
  }>;
  anomalies: Array<{
    metric: string;
    current: number;
    expected: number;
    change_percent: number;
  }>;
  county_analysis: Array<{
    county: string;
    total_cases: number;
    completion_rate: number;
    active_agents: number;
    avg_resolution_time: number;
  }>;
}

const SupervisorDashboard = () => {
  const [data, setData] = useState<SupervisorDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<"today" | "week" | "month" | "quarter" | "year">("month");
  const [selectedCounty, setSelectedCounty] = useState<string>("all");
  const themeSettings = useSelector((state: any) => state.theme.themeSettings);
  const isDarkMode = themeSettings["data-bs-theme"] === "dark";

  // Helper function to get chart colors based on theme
  const getChartColors = () => ({
    text: isDarkMode ? "#D9DCFF" : "#1f2937",
    grid: isDarkMode ? "#161641" : "#e5e7eb",
    track: isDarkMode ? "#161641" : "#e5e7eb",
    tooltipTheme: isDarkMode ? "dark" : "light" as const,
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params: any = { date_range: dateRange };
      if (selectedCounty !== "all") {
        params.county = selectedCounty;
      }
      
      const res = await API.get("supervisor-dashboard/", { params });
      if (res.data?.status === "success") {
        setData(res.data);
      } else {
        console.error("Invalid response from API:", res.data);
        throw new Error("Invalid API response");
      }
    } catch (error) {
      console.error("Error fetching supervisor dashboard data:", error);
      // Don't use mock data - show error instead
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [dateRange, selectedCounty]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading || !data) {
    return (
      <div className="supervisor-dashboard-loading">
        {loading ? (
          <>
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <p>Loading supervisor dashboard...</p>
          </>
        ) : (
          <>
            <div className="alert alert-danger" role="alert">
              <strong>Error:</strong> Failed to load dashboard data. Please refresh the page or try again later.
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="page-wrapper">
        <div className="content supervisor-dashboard">
          <div className="dashboard-header">
            <div>
              <h2>Supervisor Dashboard</h2>
              <p>Comprehensive analytics and performance metrics</p>
            </div>
            <div className="dashboard-controls">
              <select 
                className="form-select" 
                value={dateRange} 
                onChange={(e) => setDateRange(e.target.value as any)}
              >
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="quarter">This Quarter</option>
                <option value="year">This Year</option>
              </select>
              <select 
                className="form-select" 
                value={selectedCounty} 
                onChange={(e) => setSelectedCounty(e.target.value)}
              >
                <option value="all">All Counties</option>
                {data.county_analysis.map((county) => (
                  <option key={county.county} value={county.county}>
                    {county.county}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Core Metrics Section */}
          <section className="dashboard-section">
            <h3>Core Metrics</h3>
            <div className="kpi-cards">
          <KPICard 
            title="Total Tasks" 
            value={data.kpi.total_tasks} 
            icon="📊" 
            color="#0092E4" 
          />
          <KPICard 
            title="Completion Rate" 
            value={`${data.kpi.completion_rate}%`} 
            icon="✓" 
            color="#10b981" 
          />
          <KPICard 
            title="Active Team Members" 
            value={data.kpi.active_team_members} 
            icon="👥" 
            color="#4A90E2" 
          />
          <KPICard 
            title="Pending Issues" 
            value={data.kpi.pending_issues} 
            icon="⚠️" 
            color="#F59E0B" 
          />
        </div>

        <div className="progress-gauges">
          <ProgressGauge 
            title="Team Goals" 
            value={data.progress_gauges.team_goals} 
            color="#3B82F6" 
            chartColors={getChartColors()}
          />
          <ProgressGauge 
            title="Project Milestones" 
            value={data.progress_gauges.project_milestones} 
            color="#F59E0B" 
            chartColors={getChartColors()}
          />
          <ProgressGauge 
            title="SLA Compliance" 
            value={data.progress_gauges.sla_compliance} 
            color="#10B981" 
            chartColors={getChartColors()}
          />
        </div>
      </section>

      {/* Team Performance Section */}
      <section className="dashboard-section">
        <h3>Team Performance</h3>
        <div className="charts-row">
          <div className="chart-card">
            <h4>Team Productivity</h4>
            <TeamProductivityChart data={data.team_productivity} chartColors={getChartColors()} />
          </div>
          <div className="chart-card">
            <h4>Individual Performance</h4>
            <RadarChart data={data.individual_performance} chartColors={getChartColors()} />
          </div>
        </div>
        <div className="chart-card full-width" style={{ display: 'none' }}>
          <h4>Performance Leaderboard</h4>
          <LeaderboardTable data={data.leaderboard} />
        </div>
      </section>

      {/* Work & Task Analytics */}
      <section className="dashboard-section">
        <h3>Work & Task Analytics</h3>
        <div className="charts-row">
          <div className="chart-card">
            <h4>Task Status Distribution</h4>
            <TaskStatusDonut data={data.task_status} chartColors={getChartColors()} />
          </div>
          <div className="chart-card">
            <h4>Workload Heatmap</h4>
            <WorkloadHeatmap data={data.workload_heatmap} chartColors={getChartColors()} />
          </div>
        </div>
        <div className="chart-card full-width" style={{ display: 'none' }}>
          <h4>Task Completion Trend</h4>
          <TaskCompletionTrend data={data.task_completion_trend} chartColors={getChartColors()} />
        </div>
      </section>

      {/* Time-Based Insights */}
      <section className="dashboard-section">
        <h3>Time-Based Insights</h3>
        <div className="chart-card full-width">
          <h4>Activity Timeline</h4>
          <ActivityTimeline data={data.activity_timeline} />
        </div>
        <div className="charts-row">
          <div className="chart-card">
            <h4>Peak Hours Analysis</h4>
            <PeakHoursChart data={data.peak_hours} chartColors={getChartColors()} />
          </div>
          <div className="chart-card">
            <h4>Calls Trend</h4>
            <CallsTrendChart data={data.calls_trend} chartColors={getChartColors()} />
          </div>
        </div>
        <div className="chart-card full-width">
          <h4>Velocity Chart</h4>
          <VelocityChart data={data.velocity_chart} chartColors={getChartColors()} />
        </div>
      </section>

      {/* Quality & Issues */}
      <section className="dashboard-section" style={{ display: 'none' }}>
        <h3>Quality & Issues</h3>
        <div className="charts-row">
          <div className="chart-card">
            <h4>Issue Severity Breakdown</h4>
            <IssueSeverityChart data={data.issue_severity} chartColors={getChartColors()} />
          </div>
          <div className="chart-card">
            <h4>Resolution Time Trend</h4>
            <ResolutionTimeTrend data={data.resolution_time_trend} chartColors={getChartColors()} />
          </div>
        </div>
        <div className="chart-card full-width" style={{ display: 'none' }}>
          <h4>Error Rate Trend</h4>
          <ErrorRateTrend data={data.error_rate_trend} chartColors={getChartColors()} />
        </div>
      </section>

      {/* Resource Optimization */}
      <section className="dashboard-section" style={{ display: 'none' }}>
        <h3>Resource Optimization</h3>
        <div className="charts-row">
          <div className="chart-card">
            <h4>Resource Allocation</h4>
            <ResourceAllocationChart data={data.resource_allocation} chartColors={getChartColors()} />
          </div>
          <div className="chart-card">
            <h4>Capacity vs Demand</h4>
            <CapacityDemandChart data={data.capacity_demand} chartColors={getChartColors()} />
          </div>
        </div>
        <div className="chart-card full-width" style={{ display: 'none' }}>
          <h4>Skill Gap Analysis</h4>
          <SkillGapAnalysis data={data.skill_gap} chartColors={getChartColors()} />
        </div>
      </section>

      {/* Alerts & Anomalies */}
      <section className="dashboard-section" style={{ display: 'none' }}>
        <h3>Alerts & Anomalies</h3>
        <div className="charts-row">
          <div className="chart-card">
            <h4>Real-time Alerts</h4>
            <AlertsStream data={data.alerts} />
          </div>
          <div className="chart-card">
            <h4>Anomaly Detection</h4>
            <AnomalySparklines data={data.anomalies} />
          </div>
        </div>
      </section>

      {/* County Analysis */}
      <section className="dashboard-section">
        <h3>County Analysis</h3>
        <div className="chart-card full-width">
          <h4>Performance by County</h4>
          <CountyAnalysisTable data={data.county_analysis} />
        </div>
      </section>
        </div>
      </div>
    </>
  );
};

// KPI Card Component
const KPICard = ({ title, value, icon, color }: { title: string; value: string | number; icon: string; color: string }) => (
  <div className="kpi-card" style={{ borderLeft: `4px solid ${color}`, backgroundColor: `${color}12` }}>
    <div className="kpi-icon" style={{ backgroundColor: `${color}25` }}>{icon}</div>
    <div className="kpi-content">
      <h4>{title}</h4>
      <p className="kpi-value">{value}</p>
    </div>
  </div>
);

// Progress Gauge Component
const ProgressGauge = ({ title, value, color, chartColors }: { title: string; value: number; color: string; chartColors: any }) => {
  const options: ApexOptions = {
    chart: { type: "radialBar", height: 200 },
    plotOptions: {
      radialBar: {
        startAngle: -90,
        endAngle: 90,
        track: { background: chartColors.track },
        dataLabels: {
          name: { show: true, fontSize: "14px", color: chartColors.text },
          value: {
            show: true,
            fontSize: "24px",
            fontWeight: 700,
            color: chartColors.text,
            formatter: (val) => `${val}%`
          }
        }
      }
    },
    fill: { colors: [color] },
    labels: [title]
  };

  return (
    <div className="progress-gauge">
      <Chart options={options} series={[value]} type="radialBar" height={200} />
    </div>
  );
};

// Team Productivity Chart
const TeamProductivityChart = ({ data, chartColors }: { data: Array<{ name: string; output: number; department: string }>; chartColors: any }) => {
  const options: ApexOptions = {
    chart: { type: "bar", height: 300, toolbar: { show: false } },
    plotOptions: { bar: { columnWidth: "50%", borderRadius: 6, distributed: true } },
    colors: ["#3B82F6", "#F59E0B", "#10B981", "#EF4444", "#8B5CF6", "#06B6D4"],
    xaxis: { 
      categories: data.map(d => d.name),
      labels: { style: { colors: chartColors.text } }
    },
    yaxis: { 
      labels: { 
        style: { 
          fontSize: "12px",
          colors: chartColors.text
        } 
      } 
    },
    dataLabels: { enabled: true, offsetY: -20, style: { colors: [chartColors.text] } },
    tooltip: { 
      y: { formatter: (val) => `${val} tasks` },
      theme: chartColors.tooltipTheme
    },
    legend: { show: false },
    grid: {
      borderColor: chartColors.grid,
      strokeDashArray: 4
    }
  };

  return <Chart options={options} series={[{ data: data.map(d => d.output) }]} type="bar" height={300} />;
};

// Radar Chart for Individual Performance
const RadarChart = ({ data, chartColors }: { data: Array<{ name: string; speed: number; quality: number; availability: number; collaboration: number }>; chartColors: any }) => {
  const options: ApexOptions = {
    chart: { type: "radar", height: 350, toolbar: { show: false } },
    stroke: { width: 2 },
    fill: { opacity: 0.3 },
    markers: { size: 4 },
    xaxis: { 
      categories: ["Speed", "Quality", "Availability", "Collaboration"],
      labels: { style: { colors: chartColors.text } }
    },
    yaxis: { show: false },
    colors: ["#3B82F6", "#10B981", "#F59E0B"],
    theme: { mode: chartColors.tooltipTheme }
  };

  const series = data.slice(0, 3).map(person => ({
    name: person.name,
    data: [person.speed, person.quality, person.availability, person.collaboration]
  }));

  return <Chart options={options} series={series} type="radar" height={350} />;
};

// Leaderboard Table
const LeaderboardTable = ({ data }: { data: Array<{ rank: number; name: string; score: number; trend: "up" | "down" | "stable" }> }) => (
  <div className="leaderboard-table">
    <table className="table">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Name</th>
          <th>Score</th>
          <th>Trend</th>
        </tr>
      </thead>
      <tbody>
        {data.map((item) => (
          <tr key={item.rank}>
            <td>#{item.rank}</td>
            <td>{item.name}</td>
            <td>{item.score}</td>
            <td>
              {item.trend === "up" && <span className="trend-up">↑</span>}
              {item.trend === "down" && <span className="trend-down">↓</span>}
              {item.trend === "stable" && <span className="trend-stable">→</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// Task Status Donut Chart
const TaskStatusDonut = ({ data, chartColors }: { data: { completed: number; in_progress: number; blocked: number; pending: number }; chartColors: any }) => {
  const options: ApexOptions = {
    chart: { type: "donut", height: 300 },
    labels: ["Completed", "In Progress", "Blocked", "Pending"],
    colors: ["#10B981", "#3B82F6", "#EF4444", "#F59E0B"],
    plotOptions: { pie: { donut: { size: "65%" } } },
    dataLabels: { enabled: false },
    legend: { 
      position: "bottom",
      labels: { colors: chartColors.text }
    },
    theme: { mode: chartColors.tooltipTheme }
  };

  return <Chart options={options} series={[data.completed, data.in_progress, data.blocked, data.pending]} type="donut" height={300} />;
};

// Workload Heatmap
const WorkloadHeatmap = ({ data, chartColors }: { data: Array<{ day: string; capacity: number; workload: number }>; chartColors: any }) => {
  const options: ApexOptions = {
    chart: { type: "bar", height: 350, stacked: false, toolbar: { show: false } },
    plotOptions: { 
      bar: { 
        borderRadius: 4, 
        distributed: false,
        columnWidth: "60%",
        dataLabels: { position: "top" }
      } 
    },
    colors: ["#06B6D4", "#EC4899"],
    xaxis: { 
      categories: data.map(d => d.day),
      axisBorder: { show: true },
      axisTicks: { show: true },
      labels: { style: { colors: chartColors.text } }
    },
    yaxis: { 
      min: 0,
      max: Math.max(...data.map(d => d.capacity)) + 10,
      tickAmount: 5,
      labels: { 
        style: { fontSize: "12px", colors: chartColors.text },
        formatter: (val) => `${val}%`
      },
      title: { text: "Percentage (%)", style: { color: chartColors.text } }
    },
    legend: { position: "bottom", labels: { colors: chartColors.text } },
    tooltip: { 
      y: { 
        formatter: (val) => `${val}%`,
      },
      theme: chartColors.tooltipTheme
    },
    dataLabels: { enabled: false },
    grid: { 
      show: true,
      borderColor: chartColors.grid,
      strokeDashArray: 4,
      xaxis: { lines: { show: false } }
    }
  };

  return (
    <Chart 
      options={options} 
      series={[
        { name: "Capacity", data: data.map(d => d.capacity) },
        { name: "Workload", data: data.map(d => d.workload) }
      ]} 
      type="bar" 
      height={350} 
    />
  );
};

// Task Completion Trend
const TaskCompletionTrend = ({ data, chartColors }: { data: Array<{ date: string; completed: number; moving_avg: number }>; chartColors: any }) => {
  const options: ApexOptions = {
    chart: { type: "line", height: 300, toolbar: { show: false } },
    stroke: { curve: "smooth", width: [2, 3], dashArray: [0, 5] },
    colors: ["#3B82F6", "#10B981"],
    xaxis: { 
      categories: data.map(d => d.date),
      labels: { style: { colors: chartColors.text } }
    },
    yaxis: { 
      labels: { 
        style: { 
          fontSize: "12px",
          colors: chartColors.text
        } 
      } 
    },
    legend: { position: "bottom", labels: { colors: chartColors.text } },
    tooltip: { theme: chartColors.tooltipTheme },
    grid: {
      borderColor: chartColors.grid,
      strokeDashArray: 4
    }
  };

  return (
    <Chart 
      options={options} 
      series={[
        { name: "Completed", data: data.map(d => d.completed) },
        { name: "Moving Average", data: data.map(d => d.moving_avg) }
      ]} 
      type="line" 
      height={300} 
    />
  );
};

// Activity Timeline
const ActivityTimeline = ({ data }: { data: Array<{ milestone: string; start_date: string; end_date: string; status: "completed" | "in_progress" | "pending" }> }) => (
  <div className="activity-timeline">
    {data.map((item, index) => (
      <div key={index} className={`timeline-item ${item.status}`}>
        <div className="timeline-marker"></div>
        <div className="timeline-content">
          <h5>{item.milestone}</h5>
          <p><strong>Duration:</strong> {item.start_date} to {item.end_date}</p>
          <span className={`status-badge ${item.status}`}>{item.status.replace('_', ' ')}</span>
        </div>
      </div>
    ))}
  </div>
);

// Peak Hours Chart
const PeakHoursChart = ({ data, chartColors }: { data: Array<{ hour: number; activity: number }>; chartColors: any }) => {
  const options: ApexOptions = {
    chart: { type: "area", height: 300, toolbar: { show: false } },
    stroke: { curve: "smooth", width: 2 },
    colors: ["#8B5CF6"],
    fill: { type: "gradient", gradient: { shadeIntensity: 1, opacityFrom: 0.7, opacityTo: 0.1, colorStops: [{ offset: 0, color: "#8B5CF6", opacity: 0.8 }, { offset: 100, color: "#3B82F6", opacity: 0.2 }] } },
    xaxis: { 
      categories: data.map(d => `${d.hour}:00`),
      labels: { style: { colors: chartColors.text } }
    },
    yaxis: { 
      labels: { 
        style: { 
          fontSize: "12px",
          colors: chartColors.text
        } 
      } 
    },
    tooltip: { theme: chartColors.tooltipTheme },
    grid: {
      borderColor: chartColors.grid,
      strokeDashArray: 4
    }
  };

  return <Chart options={options} series={[{ data: data.map(d => d.activity) }]} type="area" height={300} />;
};

// Cases Resolution Velocity Chart
const VelocityChart = ({ data, chartColors }: { data: Array<{ period: string; resolved: number; pending: number; escalated: number }>; chartColors: any }) => {
  const options: ApexOptions = {
    chart: { type: "bar", height: 350, toolbar: { show: false }, stacked: false },
    plotOptions: { bar: { borderRadius: 6, columnWidth: "60%" } },
    colors: ["#10B981", "#F59E0B", "#EF4444"],
    xaxis: { 
      categories: data.map(d => d.period),
      labels: { style: { colors: chartColors.text } }
    },
    yaxis: { 
      labels: { 
        style: { 
          fontSize: "12px",
          colors: chartColors.text
        } 
      },
      title: { text: "Number of Cases", style: { color: chartColors.text } }
    },
    dataLabels: { enabled: true, offsetY: -20, style: { colors: [chartColors.text] } },
    legend: { position: "bottom", labels: { colors: chartColors.text } },
    tooltip: { 
      y: { formatter: (val) => `${val} cases` },
      theme: chartColors.tooltipTheme
    },
    grid: {
      borderColor: chartColors.grid,
      strokeDashArray: 4
    }
  };

  return (
    <Chart 
      options={options} 
      series={[
        { name: "Resolved", data: data.map(d => d.resolved) },
        { name: "Pending", data: data.map(d => d.pending) },
        { name: "Escalated", data: data.map(d => d.escalated) }
      ]} 
      type="bar" 
      height={350} 
    />
  );
};

// Calls Trend Chart
const CallsTrendChart = ({ data, chartColors }: { data: Array<{ date: string; total_calls: number; completed_calls: number; missed_calls: number }>; chartColors: any }) => {
  const options: ApexOptions = {
    chart: { type: "line", height: 300, toolbar: { show: false } },
    stroke: { curve: "smooth", width: [2, 2, 2] },
    colors: ["#3B82F6", "#10B981", "#EF4444"],
    xaxis: { 
      categories: data.map(d => d.date),
      labels: { style: { colors: chartColors.text } }
    },
    yaxis: { 
      labels: { 
        style: { 
          fontSize: "12px",
          colors: chartColors.text
        } 
      } 
    },
    legend: { position: "bottom", labels: { colors: chartColors.text } },
    tooltip: { theme: chartColors.tooltipTheme },
    grid: {
      borderColor: chartColors.grid,
      strokeDashArray: 4
    }
  };

  return (
    <Chart 
      options={options} 
      series={[
        { name: "Total Calls", data: data.map(d => d.total_calls) },
        { name: "Completed", data: data.map(d => d.completed_calls) },
        { name: "Missed", data: data.map(d => d.missed_calls) }
      ]} 
      type="line" 
      height={300} 
    />
  );
};

// Issue Severity Chart
const IssueSeverityChart = ({ data, chartColors }: { data: { critical: number; high: number; medium: number; low: number }; chartColors: any }) => {
  const options: ApexOptions = {
    chart: { type: "pie", height: 300 },
    labels: ["Critical", "High", "Medium", "Low"],
    colors: ["#EF4444", "#F59E0B", "#3B82F6", "#10B981"],
    legend: { 
      position: "bottom",
      labels: { colors: chartColors.text }
    },
    theme: { mode: chartColors.tooltipTheme }
  };

  return <Chart options={options} series={[data.critical, data.high, data.medium, data.low]} type="pie" height={300} />;
};

// Resolution Time Trend
const ResolutionTimeTrend = ({ data, chartColors }: { data: Array<{ date: string; avg_resolution_time: number }>; chartColors: any }) => {
  const options: ApexOptions = {
    chart: { type: "line", height: 300, toolbar: { show: false } },
    stroke: { curve: "smooth", width: 3 },
    colors: ["#EF4444"],
    xaxis: { 
      categories: data.map(d => d.date),
      labels: { style: { colors: chartColors.text } }
    },
    yaxis: { 
      labels: { 
        style: { 
          fontSize: "12px",
          colors: chartColors.text
        },
        formatter: (val) => `${val}h`
      } 
    },
    tooltip: { theme: chartColors.tooltipTheme },
    grid: {
      borderColor: chartColors.grid,
      strokeDashArray: 4
    }
  };

  return <Chart options={options} series={[{ data: data.map(d => d.avg_resolution_time) }]} type="line" height={300} />;
};

// Error Rate Trend
const ErrorRateTrend = ({ data, chartColors }: { data: Array<{ date: string; error_rate: number }>; chartColors: any }) => {
  const options: ApexOptions = {
    chart: { type: "line", height: 300, toolbar: { show: false } },
    stroke: { curve: "smooth", width: 3, dashArray: 0 },
    colors: ["#F59E0B"],
    xaxis: { 
      categories: data.map(d => d.date),
      labels: { style: { colors: chartColors.text } }
    },
    yaxis: { 
      labels: { 
        style: { 
          fontSize: "12px",
          colors: chartColors.text
        },
        formatter: (val) => `${val}%`
      } 
    },
    tooltip: { theme: chartColors.tooltipTheme },
    grid: {
      borderColor: chartColors.grid,
      strokeDashArray: 4
    }
  };

  return <Chart options={options} series={[{ data: data.map(d => d.error_rate) }]} type="line" height={300} />;
};

// Resource Allocation Chart
const ResourceAllocationChart = ({ data, chartColors }: { data: Array<{ project: string; hours: number }>; chartColors: any }) => {
  const options: ApexOptions = {
    chart: { type: "donut", height: 300 },
    labels: data.map(d => d.project),
    colors: ["#3B82F6", "#F59E0B", "#10B981", "#EF4444", "#8B5CF6", "#06B6D4"],
    plotOptions: { pie: { donut: { size: "65%" } } },
    dataLabels: { enabled: false },
    legend: { 
      position: "bottom",
      labels: { colors: chartColors.text }
    },
    theme: { mode: chartColors.tooltipTheme }
  };

  return <Chart options={options} series={data.map(d => d.hours)} type="donut" height={300} />;
};

// Capacity vs Demand Chart
const CapacityDemandChart = ({ data, chartColors }: { data: Array<{ period: string; available: number; utilized: number }>; chartColors: any }) => {
  const options: ApexOptions = {
    chart: { type: "bar", height: 300, stacked: true, toolbar: { show: false } },
    plotOptions: { bar: { borderRadius: 4 } },
    colors: ["#10B981", "#3B82F6"],
    xaxis: { 
      categories: data.map(d => d.period),
      labels: { style: { colors: chartColors.text } }
    },
    yaxis: { 
      labels: { 
        style: { 
          fontSize: "12px",
          colors: chartColors.text
        } 
      } 
    },
    legend: { position: "bottom", labels: { colors: chartColors.text } },
    tooltip: { theme: chartColors.tooltipTheme },
    grid: {
      borderColor: chartColors.grid,
      strokeDashArray: 4
    }
  };

  return (
    <Chart 
      options={options} 
      series={[
        { name: "Available", data: data.map(d => d.available) },
        { name: "Utilized", data: data.map(d => d.utilized) }
      ]} 
      type="bar" 
      height={300} 
    />
  );
};

// Skill Gap Analysis
const SkillGapAnalysis = ({ data, chartColors }: { data: Array<{ skill: string; needed: number; available: number }>; chartColors: any }) => {
  const options: ApexOptions = {
    chart: { type: "bar", height: 300, toolbar: { show: false } },
    plotOptions: { bar: { borderRadius: 6 } },
    colors: ["#EF4444", "#10B981"],
    xaxis: { 
      categories: data.map(d => d.skill),
      labels: { style: { colors: chartColors.text } }
    },
    yaxis: { 
      labels: { 
        style: { 
          fontSize: "12px",
          colors: chartColors.text
        } 
      } 
    },
    legend: { position: "bottom", labels: { colors: chartColors.text } },
    tooltip: { theme: chartColors.tooltipTheme },
    grid: {
      borderColor: chartColors.grid,
      strokeDashArray: 4
    }
  };

  return (
    <Chart 
      options={options} 
      series={[
        { name: "Needed", data: data.map(d => d.needed) },
        { name: "Available", data: data.map(d => d.available) }
      ]} 
      type="bar" 
      height={300} 
    />
  );
};

// Alerts Stream
const AlertsStream = ({ data }: { data: Array<{ id: number; type: "critical" | "warning" | "info"; message: string; timestamp: string }> }) => (
  <div className="alerts-stream">
    {data.map((alert) => (
      <div key={alert.id} className={`alert-item ${alert.type}`}>
        <span className="alert-icon">
          {alert.type === "critical" && "🚨"}
          {alert.type === "warning" && "⚠️"}
          {alert.type === "info" && "ℹ️"}
        </span>
        <div className="alert-content">
          <p>{alert.message}</p>
          <small>{alert.timestamp}</small>
        </div>
      </div>
    ))}
  </div>
);

// Anomaly Sparklines
const AnomalySparklines = ({ data }: { data: Array<{ metric: string; current: number; expected: number; change_percent: number }> }) => (
  <div className="anomaly-sparklines">
    {data.map((anomaly, index) => (
      <div key={index} className="anomaly-item">
        <div className="anomaly-header">
          <span className="anomaly-metric">{anomaly.metric}</span>
          <span className={`anomaly-change ${anomaly.change_percent > 20 ? "high" : "normal"}`}>
            {anomaly.change_percent > 0 ? "+" : ""}{anomaly.change_percent}%
          </span>
        </div>
        <div className="anomaly-values">
          <span className="current">{anomaly.current}</span>
          <span className="expected">Expected: {anomaly.expected}</span>
        </div>
      </div>
    ))}
  </div>
);

// County Analysis Table
const CountyAnalysisTable = ({ data }: { data: Array<{ county: string; total_cases: number; completion_rate: number; active_agents: number; avg_resolution_time: number }> }) => (
  <div className="county-analysis-table">
    <table className="table">
      <thead>
        <tr>
          <th>County</th>
          <th>Total Cases</th>
          <th>Completion Rate</th>
          <th>Active Agents</th>
          <th>Avg Resolution Time</th>
        </tr>
      </thead>
      <tbody>
        {data.map((county, index) => (
          <tr key={index}>
            <td>{county.county}</td>
            <td>{county.total_cases}</td>
            <td>
              <div className="progress-bar-container">
                <div 
                  className="progress-bar" 
                  style={{ width: `${county.completion_rate}%`, backgroundColor: county.completion_rate >= 80 ? "#10b981" : county.completion_rate >= 50 ? "#FFA201" : "#E41F07" }}
                ></div>
                <span>{county.completion_rate}%</span>
              </div>
            </td>
            <td>{county.active_agents}</td>
            <td>{county.avg_resolution_time}h</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// Mock data generator for development
const generateMockData = (): SupervisorDashboardData => ({
  kpi: {
    total_tasks: 1247,
    completion_rate: 87,
    active_team_members: 23,
    pending_issues: 15
  },
  progress_gauges: {
    team_goals: 78,
    project_milestones: 65,
    sla_compliance: 92
  },
  team_productivity: [
    { name: "John Doe", output: 45, department: "Support" },
    { name: "Jane Smith", output: 52, department: "Support" },
    { name: "Mike Johnson", output: 38, department: "Sales" },
    { name: "Sarah Williams", output: 61, department: "Support" },
    { name: "Tom Brown", output: 43, department: "Sales" }
  ],
  individual_performance: [
    { name: "John Doe", speed: 85, quality: 90, availability: 95, collaboration: 88 },
    { name: "Jane Smith", speed: 92, quality: 88, availability: 90, collaboration: 95 },
    { name: "Mike Johnson", speed: 78, quality: 85, availability: 88, collaboration: 82 }
  ],
  leaderboard: [
    { rank: 1, name: "Jane Smith", score: 95, trend: "up" },
    { rank: 2, name: "John Doe", score: 92, trend: "stable" },
    { rank: 3, name: "Sarah Williams", score: 88, trend: "up" },
    { rank: 4, name: "Mike Johnson", score: 85, trend: "down" },
    { rank: 5, name: "Tom Brown", score: 82, trend: "stable" }
  ],
  task_status: {
    completed: 856,
    in_progress: 245,
    blocked: 32,
    pending: 114
  },
  workload_heatmap: [
    { day: "Mon", capacity: 40, workload: 35 },
    { day: "Tue", capacity: 40, workload: 38 },
    { day: "Wed", capacity: 40, workload: 32 },
    { day: "Thu", capacity: 40, workload: 40 },
    { day: "Fri", capacity: 40, workload: 36 },
    { day: "Sat", capacity: 20, workload: 15 },
    { day: "Sun", capacity: 20, workload: 8 }
  ],
  task_completion_trend: [
    { date: "Week 1", completed: 145, moving_avg: 140 },
    { date: "Week 2", completed: 152, moving_avg: 148 },
    { date: "Week 3", completed: 138, moving_avg: 145 },
    { date: "Week 4", completed: 165, moving_avg: 150 }
  ],
  activity_timeline: [
    { milestone: "Project Kickoff", start_date: "Jan 1", end_date: "Jan 5", status: "completed" },
    { milestone: "Phase 1 Development", start_date: "Jan 6", end_date: "Jan 20", status: "completed" },
    { milestone: "Testing Phase", start_date: "Jan 21", end_date: "Feb 5", status: "in_progress" },
    { milestone: "Deployment", start_date: "Feb 6", end_date: "Feb 10", status: "pending" }
  ],
  peak_hours: [
    { hour: 8, activity: 15 },
    { hour: 9, activity: 35 },
    { hour: 10, activity: 45 },
    { hour: 11, activity: 50 },
    { hour: 12, activity: 30 },
    { hour: 13, activity: 25 },
    { hour: 14, activity: 40 },
    { hour: 15, activity: 48 },
    { hour: 16, activity: 42 },
    { hour: 17, activity: 35 }
  ],
  velocity_chart: [
    { period: "Week 1", resolved: 145, pending: 32, escalated: 8 },
    { period: "Week 2", resolved: 158, pending: 28, escalated: 6 },
    { period: "Week 3", resolved: 142, pending: 35, escalated: 9 },
    { period: "Week 4", resolved: 167, pending: 24, escalated: 5 }
  ],
  calls_trend: [
    { date: "Week 1", total_calls: 245, completed_calls: 198, missed_calls: 12 },
    { date: "Week 2", total_calls: 267, completed_calls: 218, missed_calls: 14 },
    { date: "Week 3", total_calls: 238, completed_calls: 195, missed_calls: 10 },
    { date: "Week 4", total_calls: 289, completed_calls: 248, missed_calls: 8 }
  ],
  issue_severity: {
    critical: 5,
    high: 12,
    medium: 28,
    low: 45
  },
  resolution_time_trend: [
    { date: "Week 1", avg_resolution_time: 4.5 },
    { date: "Week 2", avg_resolution_time: 4.2 },
    { date: "Week 3", avg_resolution_time: 3.8 },
    { date: "Week 4", avg_resolution_time: 3.5 }
  ],
  error_rate_trend: [
    { date: "Week 1", error_rate: 2.5 },
    { date: "Week 2", error_rate: 2.1 },
    { date: "Week 3", error_rate: 1.8 },
    { date: "Week 4", error_rate: 1.5 }
  ],
  resource_allocation: [
    { project: "Project A", hours: 120 },
    { project: "Project B", hours: 95 },
    { project: "Project C", hours: 80 },
    { project: "Support", hours: 150 },
    { project: "Training", hours: 45 }
  ],
  capacity_demand: [
    { period: "Week 1", available: 200, utilized: 180 },
    { period: "Week 2", available: 200, utilized: 195 },
    { period: "Week 3", available: 200, utilized: 175 },
    { period: "Week 4", available: 200, utilized: 190 }
  ],
  skill_gap: [
    { skill: "Technical", needed: 15, available: 12 },
    { skill: "Communication", needed: 20, available: 18 },
    { skill: "Leadership", needed: 8, available: 5 },
    { skill: "Problem Solving", needed: 18, available: 16 }
  ],
  alerts: [
    { id: 1, type: "critical", message: "SLA breach detected for Project A", timestamp: "2 mins ago" },
    { id: 2, type: "warning", message: "Team capacity at 95% utilization", timestamp: "15 mins ago" },
    { id: 3, type: "info", message: "New milestone achieved in Project B", timestamp: "1 hour ago" }
  ],
  anomalies: [
    { metric: "Task Completion", current: 165, expected: 145, change_percent: 13.8 },
    { metric: "Response Time", current: 2.1, expected: 3.5, change_percent: -40 },
    { metric: "Error Rate", current: 1.5, expected: 2.0, change_percent: -25 }
  ],
  county_analysis: [
    { county: "Nairobi", total_cases: 342, completion_rate: 92, active_agents: 8, avg_resolution_time: 2.8 },
    { county: "Mombasa", total_cases: 215, completion_rate: 88, active_agents: 5, avg_resolution_time: 3.2 },
    { county: "Kisumu", total_cases: 178, completion_rate: 85, active_agents: 4, avg_resolution_time: 3.5 },
    { county: "Nakuru", total_cases: 156, completion_rate: 90, active_agents: 4, avg_resolution_time: 3.0 },
    { county: "Eldoret", total_cases: 134, completion_rate: 82, active_agents: 3, avg_resolution_time: 3.8 }
  ]
});

export default SupervisorDashboard;
