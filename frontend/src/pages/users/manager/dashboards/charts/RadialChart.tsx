import React, { useState, useEffect } from 'react';
import ReactApexChart from "react-apexcharts";
import API from "../../../../../services/api";

function RadialChart({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [radialChart, setRadialChart] = useState<any>({
    chart: { height: 350, type: "radialBar", toolbar: { show: false } },
    plotOptions: {
      radialBar: {
        dataLabels: {
          name: { fontSize: "14px" },
          value: { fontSize: "13px" },
          total: { show: true, label: "Avg Load", formatter: () => "0%" },
        },
      },
    },
    series: [0, 0, 0, 0],
    labels: ["WhatsApp", "Facebook", "Email", "Instagram"],
    colors: ["#25D366", "#1877F2", "#EA4335", "#E1306C"],
  });

  useEffect(() => {
    API.get("team/workload/").then(r => {
      const team: any[] = r.data?.team_workload ?? [];
      if (!team.length) return;
      const top    = team.slice(0, 6);
      const labels = top.map((c: any) => (c.counsellor_name || "").split(" ")[0]);
      const series = top.map((c: any) => Math.min(c.workload_pct ?? 0, 100));
      const avg    = series.length ? Math.round(series.reduce((a, v) => a + v, 0) / series.length) : 0;
      setRadialChart((p: any) => ({
        ...p,
        series,
        labels,
        colors: undefined,
        plotOptions: {
          radialBar: {
            dataLabels: {
              name: { fontSize: "14px" },
              value: { fontSize: "13px" },
              total: { show: true, label: "Avg Load", formatter: () => `${avg}%` },
            },
          },
        },
      }));
    }).catch(() => {});
  }, [dateFrom, dateTo]);

  return (
    <>
      <div className="col-md-6">
        <div className="card">
          <div className="card-header"><h5 className="card-title">Counsellor Workload %</h5></div>
          <div className="card-body">
            <div id="radial-chart" />
            <ReactApexChart options={radialChart} series={radialChart.series} type="radialBar" height={350} />
          </div>
        </div>
      </div>
    </>
  );
}

export default RadialChart;
