package com.example.demo.model;

import lombok.Data;

@Data
public class VerifyRequest {
    private String status; // APPROVED or REJECTED
}
