import React, { useState, useEffect } from 'react';
import ReactApexChart from "react-apexcharts";
import API from "../../../../../services/api";

function DonutChart({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [donutChart, setDonutChart] = useState<any>({
    chart: { height: 350, type: "donut", toolbar: { show: false } },
    series: [0, 0, 0, 0],
    labels: ["WhatsApp", "Facebook", "Email", "Instagram"],
    colors: ["#25D366", "#1877F2", "#EA4335", "#E1306C"],
    responsive: [{ breakpoint: 480, options: { chart: { width: 200 }, legend: { position: "bottom" } } }],
  });

  useEffect(() => {
    API.get(`statistics/?date_from=${dateFrom}&date_to=${dateTo}`).then(r => {
      if (!r.data?.success) return;
      const b = r.data.data.breakdown;
      setDonutChart((p: any) => ({
        ...p,
        series: [
          b.whatsapp?.conversations  ?? 0,
          b.facebook?.conversations  ?? 0,
          b.email?.conversations     ?? 0,
          b.instagram?.conversations ?? 0,
        ],
      }));
    }).catch(() => {});
  }, [dateFrom, dateTo]);

  return (
    <>
      <div className="col-md-6">
        <div className="card">
          <div className="card-header"><h5 className="card-title">Conversation Share by Channel</h5></div>
          <div className="card-body">
            <div id="donut-chart" />
            <ReactApexChart options={donutChart} series={donutChart.series} type="donut" height={350} />
          </div>
        </div>
      </div>
    </>
  );
}

export default DonutChart;
