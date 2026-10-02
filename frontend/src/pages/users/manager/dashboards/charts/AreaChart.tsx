import React, { useState, useEffect } from 'react';
import ReactApexChart from "react-apexcharts";
import API from "../../../../../services/api";

function AreaChart({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [sLineArea, setSLineArea] = useState<any>({
    chart: { height: 350, type: "area", toolbar: { show: false } },
    dataLabels: { enabled: false },
    stroke: { curve: "smooth" },
    title: { text: "Messages by Channel", align: "left" },
    series: [
      { name: "Messages",      data: [0, 0, 0, 0] },
      { name: "Conversations", data: [0, 0, 0, 0] },
    ],
    xaxis: { categories: ["WhatsApp", "Facebook", "Email", "Instagram"] },
    tooltip: { x: { format: "dd/MM/yy" } },
  });

  useEffect(() => {
    API.get(`statistics/?date_from=${dateFrom}&date_to=${dateTo}`).then(r => {
      if (!r.data?.success) return;
      const b = r.data.data.breakdown;
      const keys = ["whatsapp", "facebook", "email", "instagram"] as const;
      setSLineArea((p: any) => ({
        ...p,
        series: [
          { name: "Messages",      data: keys.map(k => b[k]?.messages      ?? 0) },
          { name: "Conversations", data: keys.map(k => b[k]?.conversations ?? 0) },
        ],
      }));
    }).catch(() => {});
  }, [dateFrom, dateTo]);

  return (
    <>
      <div className="col-md-6">
        <div className="card">
          <div className="card-header"><h5 className="card-title">Messages by Channel</h5></div>
          <div className="card-body">
            <div id="s-line" />
            <ReactApexChart options={sLineArea} series={sLineArea.series} type="line" height={350} />
          </div>
        </div>
      </div>
    </>
  );
}

export default AreaChart;
