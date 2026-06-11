def calculate_payroll(ctc: float, absent_days: float, leave_days: float,
                      bonus: float = 0, other_deductions: float = 0,
                      working_days: int = 26) -> dict:
    monthly_gross = round(ctc / 12, 2) if ctc else 0
    per_day = round(monthly_gross / working_days, 2) if working_days else 0
    absent_deduction = round(per_day * absent_days, 2)
    leave_deduction = round(per_day * leave_days * 0.5, 2)
    total_deductions = round(absent_deduction + leave_deduction + other_deductions, 2)
    net_salary = round(monthly_gross + bonus - total_deductions, 2)
    return {
        "monthly_gross": monthly_gross,
        "per_day_salary": per_day,
        "absent_deduction": absent_deduction,
        "leave_deduction": leave_deduction,
        "bonus": bonus,
        "other_deductions": other_deductions,
        "total_deductions": total_deductions,
        "net_salary": max(net_salary, 0),
    }
