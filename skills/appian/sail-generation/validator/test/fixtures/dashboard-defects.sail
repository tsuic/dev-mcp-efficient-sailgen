a!localVariables(
  /* KPI with invalid batchSize */
  local!kpi1: a!queryRecordType(
    recordType: 'recordType!{fake-uuid}Ticket',
    fields: a!aggregationFields(
      measures: a!measure(field: 'recordType!{fake-uuid}Ticket.fields.{f1}id', function: "COUNT", alias: "count")
    ),
    pagingInfo: a!pagingInfo(startIndex: 1, batchSize: -1)
  ).data[1].count,

  /* text() with 1 arg — should be tostring() or text(val, format) */
  local!display: text(local!kpi1),

  /* Page frame wrapped in array — invalid */
  {
    a!headerContentLayout(
      header: {},
      contents: {
        a!columnsLayout(
          columns: {
            a!columnLayout(
              contents: {
                /* Chart with filters inside config — invalid */
                a!pieChartField(
                  labelPosition: "COLLAPSED",
                  data: 'recordType!{fake-uuid}Ticket',
                  config: a!pieChartConfig(
                    primaryGrouping: a!grouping(field: 'recordType!{fake-uuid}Ticket.fields.{f2}category', alias: "cat"),
                    measures: a!measure(field: 'recordType!{fake-uuid}Ticket.fields.{f1}id', function: "COUNT", alias: "cnt"),
                    dataLimit: 100,
                    filters: a!queryFilter(field: 'recordType!{fake-uuid}Ticket.fields.{f3}status', operator: "=", value: 1)
                  ),
                  style: "PIE",
                  height: "MEDIUM"
                ),
                /* Grid with showSearchBox on non-record data */
                a!gridField(
                  labelPosition: "COLLAPSED",
                  data: local!kpi1,
                  columns: {
                    a!gridColumn(label: "Col", value: fv!row)
                  },
                  showSearchBox: true(),
                  pageSize: 10
                )
              }
            )
          }
        )
      }
    )
  }
)
