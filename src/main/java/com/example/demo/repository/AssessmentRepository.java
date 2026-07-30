package com.example.demo.repository;

import com.example.demo.model.Assessment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface AssessmentRepository extends JpaRepository<Assessment, Long> {
    List<Assessment> findByStudentId(Long studentId);
    List<Assessment> findBySubmittedToSaiTrueOrderByCreatedAtDesc();
}
