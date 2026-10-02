import React, { useState, useEffect } from 'react';
import ReactApexChart from "react-apexcharts";
import API from "../../../../../services/api";

function ColumnChart({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [sCol, setSCol] = useState<any>({
    chart: { height: 350, type: "bar", toolbar: { show: false } },
    plotOptions: { bar: { horizontal: false, columnWidth: "55%", endingShape: "rounded" } },
    dataLabels: { enabled: false },
    stroke: { show: true, width: 2, colors: ["transparent"] },
    series: [
      { name: "Active Chats", data: [] },
      { name: "Max Capacity", data: [] },
      { name: "Resolved",     data: [] },
    ],
    xaxis: { categories: [] },
    yaxis: { title: { text: "Chats" } },
    fill: { opacity: 1 },
    tooltip: { y: { formatter: (val: any) => `${val} chats` } },
  });

  useEffect(() => {
    Promise.allSettled([
      API.get("team/workload/"),
      API.get(`conversations/?status=resolved`),
    ]).then(([teamRes, resolvedRes]) => {
      const team: any[] = teamRes.status === "fulfilled" ? (teamRes.value.data?.team_workload ?? []) : [];
      const resolved: any[] = resolvedRes.status === "fulfilled" ? (resolvedRes.value.data?.results ?? []) : [];

      if (!team.length) return;

      // Count resolved per counsellor
      const resolvedMap: Record<number, number> = {};
      resolved.forEach((c: any) => {
        if (c.assigned_to?.id) resolvedMap[c.assigned_to.id] = (resolvedMap[c.assigned_to.id] || 0) + 1;
      });

      const names    = team.map((c: any) => (c.counsellor_name || "").split(" ")[0]);
      const active   = team.map((c: any) => c.active_chats ?? 0);
      const maxC     = team.map((c: any) => c.max_chats    ?? 5);
      const resolvedC = team.map((c: any) => resolvedMap[c.counsellor_id] ?? 0);

      setSCol((p: any) => ({
        ...p,
        series: [
          { name: "Active Chats", data: active   },
          { name: "Max Capacity", data: maxC     },
          { name: "Resolved",     data: resolvedC },
        ],
        xaxis: { categories: names },
      }));
    });
  }, [dateFrom, dateTo]);

  return (
    <>
      <div className="col-md-6">
        <div className="card">
          <div className="card-header"><h5 className="card-title">Counsellor Workload</h5></div>
          <div className="card-body">
            <div id="s-col" />
            <ReactApexChart options={sCol} series={sCol.series} type="bar" height={350} />
          </div>
        </div>
      </div>
    </>
  );
}

export default ColumnChart;
